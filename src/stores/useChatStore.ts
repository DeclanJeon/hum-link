/**
 * @fileoverview       Zustand  (v2.2.3 - Chrono-Filter Calibrated)
 * @module stores/useChatStore
 * @description v2.2.3: EMA 스무딩 필터와 실시간 감시자(Stall Detector)를 도입하여
 *              수신 UI의 속도/ETA 표시가 멈추거나 널뛰는 현상을 완벽하게 해결.
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { usePeerConnectionStore } from './usePeerConnectionStore';
import { initDB, saveChunk, getAndAssembleFile, deleteFileChunks } from '@/lib/indexedDBHelper';
import { toast } from 'sonner';

// EMA 스무딩 계수 (값이 작을수록 부드러움)
const SMOOTHING_ALPHA = 0.15;

export interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  chunkSize: number;
}

export interface FileTransferProgress {
  progress: number;
  isSending: boolean;
  isReceiving: boolean;
  isComplete: boolean;
  isCancelled?: boolean;
  blobUrl?: string;
  senderId: string;
  receivedChunks: Set<number>;
  endSignalReceived: boolean;
  lastActivityTime: number;
  lastReceivedSize?: number;
  speed: number;
  eta: number;
  averageSpeed: number;
  totalTransferTime: number;
  // v2.2.3: 실시간 감시자(Stall Detector)를 위한 필드
  speedMonitorInterval: NodeJS.Timeout | null;
}

export type MessageType = 'text' | 'file';

export interface ChatMessage {
  id: string;
  type: MessageType;
  text?: string;
  fileMeta?: FileMetadata;
  senderId: string;
  senderNickname: string;
  timestamp: number;
}

const HEADER_TYPE_OFFSET = 0;
const HEADER_ID_LEN_OFFSET = 1;
const HEADER_ID_OFFSET = 3;

function parseChunkHeader(buffer: ArrayBuffer): { type: number; transferId: string; chunkIndex?: number; data?: ArrayBuffer } | null {
    if (buffer.byteLength < HEADER_ID_OFFSET) return null;
    const view = new DataView(buffer);
    const type = view.getUint8(HEADER_TYPE_OFFSET);
    const idLength = view.getUint16(HEADER_ID_LEN_OFFSET, false);
    const headerBaseSize = HEADER_ID_OFFSET + idLength;
    if (buffer.byteLength < headerBaseSize) return null;
    const transferIdBytes = new Uint8Array(buffer, HEADER_ID_OFFSET, idLength);
    const transferId = new TextDecoder().decode(transferIdBytes);

    if (type === 1) {
        const dataHeaderSize = headerBaseSize + 4;
        if (buffer.byteLength < dataHeaderSize) return null;
        const chunkIndex = view.getUint32(headerBaseSize, false);
        const data = buffer.slice(dataHeaderSize);
        return { type, transferId, chunkIndex, data };
    } else if (type === 2) {
        return { type, transferId };
    }
    return null;
}

interface ChatState {
  chatMessages: ChatMessage[];
  isTyping: Map<string, string>;
  fileTransfers: Map<string, FileTransferProgress>;
  pendingChunks: Map<string, ArrayBuffer[]>;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => Promise<void>;
  handleIncomingChunk: (peerId: string, receivedData: ArrayBuffer | Uint8Array) => Promise<void>;
  checkAndAssembleIfComplete: (transferId: string) => Promise<void>;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  clearChat: () => void;
  updateFileTransferState: (transferId: string, updates: Partial<FileTransferProgress>) => void;
  handleFileCancel: (transferId: string) => Promise<void>;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),
  pendingChunks: new Map(),

  addMessage: (message) => set(produce((state: ChatState) => {
    if (!state.chatMessages.some((msg) => msg.id === message.id)) {
      state.chatMessages.push(message);
    }
  })),

  addFileMessage: async (senderId, senderNickname, fileMeta, isLocal = false) => {
    if (get().fileTransfers.has(fileMeta.transferId)) return;
    const newFileMessage: ChatMessage = { id: fileMeta.transferId, type: 'file', fileMeta, senderId, senderNickname, timestamp: Date.now() };
    
    // v2.2.3: 감시자 초기화
    let speedMonitorInterval: NodeJS.Timeout | null = null;
    if (!isLocal) {
        speedMonitorInterval = setInterval(() => {
            const transfer = get().fileTransfers.get(fileMeta.transferId);
            if (transfer && !transfer.isComplete && !transfer.isCancelled) {
                const now = Date.now();
                if (now - transfer.lastActivityTime > 1500) { // 1.5초 이상 활동 없으면
                    set(produce((state: ChatState) => {
                        const t = state.fileTransfers.get(fileMeta.transferId);
                        if (t && t.speed > 0) {
                            t.speed = 0;
                            t.eta = Infinity;
                        }
                    }));
                }
            }
        }, 1000);
    }

    const newTransferProgress: FileTransferProgress = { progress: 0, isSending: isLocal, isReceiving: !isLocal, isComplete: false, isCancelled: false, senderId, receivedChunks: new Set(), endSignalReceived: false, lastActivityTime: Date.now(), lastReceivedSize: 0, speed: 0, eta: Infinity, averageSpeed: 0, totalTransferTime: 0, speedMonitorInterval };
    
    set(produce((state: ChatState) => {
        state.chatMessages.push(newFileMessage);
        state.fileTransfers.set(fileMeta.transferId, newTransferProgress);
    }));

    if (!isLocal) {
        await initDB();
        const pending = get().pendingChunks.get(fileMeta.transferId);
        if (pending) {
            console.log(`[ChatStore] Processing ${pending.length} pending chunks for ${fileMeta.transferId}`);
            for (const chunk of pending) { await get().handleIncomingChunk(senderId, chunk); }
            set(produce(state => { state.pendingChunks.delete(fileMeta.transferId) }));
        }
    }
  },

  handleIncomingChunk: async (peerId, receivedData) => {
    const chunkBuffer = (receivedData instanceof Uint8Array) ? receivedData.buffer.slice(receivedData.byteOffset, receivedData.byteOffset + receivedData.byteLength) : receivedData;
    const parsed = parseChunkHeader(chunkBuffer);
    if (!parsed) { console.warn('[ChatStore] Failed to parse chunk header.'); return; }
    const { type, transferId, chunkIndex, data } = parsed;
    const { fileTransfers, checkAndAssembleIfComplete } = get();
    if (!fileTransfers.has(transferId)) {
        set(produce((state: ChatState) => {
            if (!state.pendingChunks.has(transferId)) state.pendingChunks.set(transferId, []);
            state.pendingChunks.get(transferId)!.push(chunkBuffer);
        }));
        return;
    }
    const transfer = fileTransfers.get(transferId)!;
    if (transfer.isComplete || transfer.isCancelled) return;
    if (type === 1 && typeof chunkIndex === 'number' && data) {
        if (transfer.receivedChunks.has(chunkIndex)) return;
        try {
            await saveChunk(transferId, chunkIndex, data);
            usePeerConnectionStore.getState().sendToPeer(peerId, JSON.stringify({ type: 'file-ack', payload: { transferId, chunkIndex } }));
            set(produce((state: ChatState) => {
                const currentTransfer = state.fileTransfers.get(transferId);
                const message = state.chatMessages.find(m => m.id === transferId);
                if (currentTransfer && message?.fileMeta) {
                    currentTransfer.receivedChunks.add(chunkIndex);
                    
                    const now = Date.now();
                    const elapsed = (now - currentTransfer.lastActivityTime) / 1000;
                    const receivedBytesSinceLastUpdate = data.byteLength;

                    // v2.2.3: EMA 스무딩 필터 적용
                    if (elapsed > 0.01) { // 너무 짧은 간격은 무시
                        const instantaneousSpeed = receivedBytesSinceLastUpdate / elapsed;
                        const previousSpeed = currentTransfer.speed;
                        const newSmoothedSpeed = (instantaneousSpeed * SMOOTHING_ALPHA) + (previousSpeed * (1 - SMOOTHING_ALPHA));
                        
                        currentTransfer.speed = newSmoothedSpeed;
                        
                        const totalReceived = (currentTransfer.lastReceivedSize || 0) + receivedBytesSinceLastUpdate;
                        const remainingBytes = message.fileMeta.size - totalReceived;
                        currentTransfer.eta = newSmoothedSpeed > 0 ? remainingBytes / newSmoothedSpeed : Infinity;
                    }

                    currentTransfer.progress = currentTransfer.receivedChunks.size / message.fileMeta.totalChunks;
                    currentTransfer.lastReceivedSize = (currentTransfer.lastReceivedSize || 0) + data.byteLength;
                    currentTransfer.lastActivityTime = now;
                }
            }));
        } catch (error) { console.error(`[ChatStore] Failed to save chunk ${chunkIndex}:`, error); }
    } else if (type === 2) {
        if (!transfer.endSignalReceived) {
            set(produce((state: ChatState) => { state.fileTransfers.get(transferId)!.endSignalReceived = true; }));
            console.log(`[ChatStore] End signal received for ${transferId}.`);
            setTimeout(() => checkAndAssembleIfComplete(transferId), 1000);
        }
    }
  },

  checkAndAssembleIfComplete: async (transferId: string) => {
    const { fileTransfers, chatMessages } = get();
    const transfer = fileTransfers.get(transferId);
    const message = chatMessages.find(m => m.id === transferId);
    if (!transfer || !message?.fileMeta || transfer.isComplete || transfer.isCancelled) return;
    
    // v2.2.3: 감시자 정리
    if (transfer.speedMonitorInterval) {
        clearInterval(transfer.speedMonitorInterval);
    }
    
    const isReadyToAssemble = transfer.endSignalReceived && transfer.receivedChunks.size >= message.fileMeta.totalChunks;
    if (isReadyToAssemble) {
        console.log(`[ChatStore] Assembling file: ${transferId}`);
        try {
            const blob = await getAndAssembleFile(transferId, message.fileMeta.type);
            if (blob && Math.abs(blob.size - message.fileMeta.size) < 1024) {
                const totalTransferTime = Date.now() - message.timestamp;
                const averageSpeed = totalTransferTime > 0 ? message.fileMeta.size / (totalTransferTime / 1000) : 0;

                set(produce((state: ChatState) => {
                    const t = state.fileTransfers.get(transferId);
                    if (t) { 
                        t.isComplete = true; 
                        t.isReceiving = false; 
                        t.progress = 1; 
                        t.blobUrl = URL.createObjectURL(blob);
                        t.speed = 0;
                        t.eta = 0;
                        t.averageSpeed = averageSpeed;
                        t.totalTransferTime = totalTransferTime;
                        t.speedMonitorInterval = null; // 정리
                    }
                }));

                usePeerConnectionStore.getState().sendToPeer(transfer.senderId, JSON.stringify({
                    type: 'TRANSFER_COMPLETE_ACK',
                    payload: { transferId }
                }));

                toast.success(`File "${message.fileMeta.name}" received successfully!`);
                await deleteFileChunks(transferId);
            } else { throw new Error(`Assembly failed or size mismatch. Expected: ${message.fileMeta.size}, Got: ${blob?.size}`); }
        } catch (error) {
            console.error(`[ChatStore] File assembly error for ${transferId}:`, error);
            get().updateFileTransferState(transferId, { isReceiving: false, isCancelled: true });
            toast.error(`Failed to assemble file: ${message.fileMeta.name}`);
        }
    }
  },
    
  setTypingState: (userId, nickname, isTyping) => set(produce((state: ChatState) => {
    if (isTyping) state.isTyping.set(userId, nickname);
    else state.isTyping.delete(userId);
  })),

  updateFileTransferState: (transferId, updates) => {
    set(produce((state: ChatState) => {
      const transfer = state.fileTransfers.get(transferId);
      if (transfer) { Object.assign(transfer, updates); }
    }));
  },

  handleFileCancel: async (transferId: string) => {
    console.log(`[ChatStore] Handling cancellation for ${transferId}`);
    const transfer = get().fileTransfers.get(transferId);
    if (transfer && !transfer.isComplete && !transfer.isCancelled) {
      // v2.2.3: 감시자 정리
      if (transfer.speedMonitorInterval) {
          clearInterval(transfer.speedMonitorInterval);
      }
      get().updateFileTransferState(transferId, { isReceiving: false, isSending: false, isCancelled: true, speedMonitorInterval: null });
      toast.info("A file transfer has been cancelled.");
      await deleteFileChunks(transferId);
    }
  },

  clearChat: () => {
    get().fileTransfers.forEach(async (transfer, transferId) => {
        if (transfer.blobUrl) URL.revokeObjectURL(transfer.blobUrl);
        // v2.2.3: 감시자 정리
        if (transfer.speedMonitorInterval) clearInterval(transfer.speedMonitorInterval);
        await deleteFileChunks(transferId);
    });
    set({ chatMessages: [], isTyping: new Map(), fileTransfers: new Map(), pendingChunks: new Map() });
  },
}));
