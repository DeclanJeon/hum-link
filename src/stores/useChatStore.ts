import { create } from 'zustand';
import { produce } from 'immer';
import { useWhiteboardStore } from './useWhiteboardStore';
import { initDB, saveChunk, getAndAssembleFile, deleteFileChunks } from '@/lib/indexedDBHelper';
import { usePeerConnectionStore } from './usePeerConnectionStore';
import { isValidChunkIndex } from '@/lib/fileTransferUtils';

export interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  chunkSize?: number;
}

export interface FileTransferProgress {
  progress: number;
  isSending: boolean;
  isReceiving: boolean;
  isComplete: boolean;
  blobUrl?: string;
  senderId: string;
  receivedChunks: Set<number>;
  endSignalReceived: boolean;
  lastActivityTime: number;
  missingChunks?: number[];
  lastProgressUpdate?: number;
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

interface ChatState {
  chatMessages: ChatMessage[];
  isTyping: Map<string, string>;
  fileTransfers: Map<string, FileTransferProgress>;
  pendingChunks: Map<string, ArrayBuffer[]>;
  endSignalsReceived: Set<string>;
  progressUpdateTimers: Map<string, NodeJS.Timeout>;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => Promise<void>;
  updateFileProgress: (transferId: string, loaded: number, immediate?: boolean) => void;
  appendFileChunk: (transferId: string, index: number, chunk: ArrayBuffer, senderId: string, isLastChunk?: boolean) => Promise<void>;
  addPendingChunk: (transferId: string, chunk: ArrayBuffer) => void;
  processPendingChunks: (transferId: string) => Promise<void>;
  handleIncomingChunk: (peerId: string, receivedData: ArrayBuffer | Uint8Array) => Promise<void>;
  checkAndAssembleIfComplete: (transferId: string) => Promise<void>;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  applyRemoteDrawEvent: (event: any) => void;
  clearChat: () => void;
}

function parseChunkHeader(buffer: ArrayBuffer): { type: number; transferId: string; chunkIndex?: number; data?: ArrayBuffer } | null {
  if (buffer.byteLength < 3) return null;
  
  const view = new DataView(buffer);
  const type = view.getUint8(0);
  const idLength = view.getUint16(1, false);
  
  if (buffer.byteLength < 3 + idLength) return null;
  
  const transferIdBytes = new Uint8Array(buffer, 3, idLength);
  const transferId = new TextDecoder().decode(transferIdBytes);
  
  if (type === 1) {
    if (buffer.byteLength < 3 + idLength + 4) return null;
    const chunkIndex = view.getUint32(3 + idLength, false);
    const data = buffer.slice(3 + idLength + 4);
    return { type, transferId, chunkIndex, data };
  } else if (type === 2) {
    return { type, transferId };
  }
  
  return null;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),
  pendingChunks: new Map(),
  endSignalsReceived: new Set(),
  progressUpdateTimers: new Map(),

  handleIncomingChunk: async (peerId, receivedData) => {
    const chunkBuffer = (receivedData instanceof Uint8Array)
        ? receivedData.slice().buffer
        : receivedData;

    if (!(chunkBuffer instanceof ArrayBuffer) || chunkBuffer.byteLength < 1) {
        console.warn('[FILE_RECEIVE] Invalid chunk buffer received');
        return;
    }

    const parsed = parseChunkHeader(chunkBuffer);
    if (!parsed) {
      console.warn('[FILE_RECEIVE] Failed to parse chunk header');
      return;
    }

    const { type, transferId, chunkIndex, data } = parsed;
    const { fileTransfers, chatMessages, appendFileChunk, addPendingChunk, endSignalsReceived } = get();
    
    const transfer = fileTransfers.get(transferId);
    const message = chatMessages.find(m => m.id === transferId);
    
    if (!transfer || !message) {
      console.log(`[FILE_RECEIVE] Transfer not found for ${transferId}, adding to pending`);
      addPendingChunk(transferId, chunkBuffer);
      return;
    }

    if (type === 1 && typeof chunkIndex === 'number' && data) {
      if (message.fileMeta && !isValidChunkIndex(chunkIndex, message.fileMeta.totalChunks)) {
        console.error(`[FILE_RECEIVE] Invalid chunk index: ${chunkIndex} for transfer ${transferId}`);
        return;
      }
      
      console.log(`[FILE_RECEIVE] Data chunk received: ${chunkIndex} for ${transferId}, size: ${data.byteLength}`);
      await appendFileChunk(transferId, chunkIndex, data, message.senderId, false);
      
    } else if (type === 2) {
      if (!endSignalsReceived.has(transferId)) {
        endSignalsReceived.add(transferId);
        console.log(`[FILE_RECEIVE] End signal received for ${transferId}`);
        
        set(produce((state: ChatState) => {
          const transfer = state.fileTransfers.get(transferId);
          if (transfer) {
            transfer.endSignalReceived = true;
          }
        }));
        
        setTimeout(() => {
          get().checkAndAssembleIfComplete(transferId);
        }, 1000);
      } else {
        console.log(`[FILE_RECEIVE] Duplicate End signal ignored for ${transferId}`);
      }
    }
  },

  addPendingChunk: (transferId, chunk) => set(produce((state: ChatState) => {
    if (!state.pendingChunks.has(transferId)) {
      state.pendingChunks.set(transferId, []);
    }
    state.pendingChunks.get(transferId)!.push(chunk);
    
    const pending = state.pendingChunks.get(transferId)!;
    if (pending.length > 1000) {
      console.warn(`[FILE_RECEIVE] Too many pending chunks for ${transferId}, clearing old ones`);
      state.pendingChunks.set(transferId, pending.slice(-500));
    }
  })),

  processPendingChunks: async (transferId) => {
    const pending = get().pendingChunks.get(transferId);
    if (pending && pending.length > 0) {
      console.log(`[FILE_RECEIVE] Processing ${pending.length} pending chunks for ${transferId}`);
      
      const { chatMessages, endSignalsReceived } = get();
      const message = chatMessages.find(m => m.id === transferId);
      
      for (const chunkBuffer of pending) {
        const parsed = parseChunkHeader(chunkBuffer);
        if (!parsed) continue;
        
        const { type, chunkIndex, data } = parsed;
        
        if (type === 1 && typeof chunkIndex === 'number' && data) {
          if (message?.fileMeta && !isValidChunkIndex(chunkIndex, message.fileMeta.totalChunks)) {
            console.error(`[FILE_RECEIVE] Invalid pending chunk index: ${chunkIndex}`);
            continue;
          }
          
          await get().appendFileChunk(transferId, chunkIndex, data, message!.senderId, false);
        } else if (type === 2) {
          if (!endSignalsReceived.has(transferId)) {
            endSignalsReceived.add(transferId);
            console.log(`[FILE_RECEIVE] Found End signal in pending chunks for ${transferId}`);
            set(produce((state: ChatState) => {
              const transfer = state.fileTransfers.get(transferId);
              if (transfer) {
                transfer.endSignalReceived = true;
              }
            }));
          }
        }
      }
      
      set(produce((state: ChatState) => { 
        state.pendingChunks.delete(transferId); 
      }));
      
      setTimeout(() => {
        get().checkAndAssembleIfComplete(transferId);
      }, 500);
    }
  },

  addFileMessage: async (senderId, senderNickname, fileMeta, isLocal = false) => {
    console.log(`[FILE_RECEIVE] Adding file message: ${fileMeta.transferId}, isLocal: ${isLocal}, totalChunks: ${fileMeta.totalChunks}`);
    
    const existingMessage = get().chatMessages.find(msg => msg.id === fileMeta.transferId);
    if (existingMessage) {
      console.log(`[FILE_RECEIVE] File message already exists: ${fileMeta.transferId}`);
      return;
    }
    
    set(produce((state: ChatState) => {
      const newFileMessage: ChatMessage = { 
        id: fileMeta.transferId, 
        type: 'file', 
        fileMeta, 
        senderId, 
        senderNickname, 
        timestamp: Date.now() 
      };
      
      state.chatMessages.push(newFileMessage);
      
      state.fileTransfers.set(fileMeta.transferId, {
        progress: 0, 
        isSending: isLocal, 
        isReceiving: !isLocal, 
        isComplete: false,
        senderId, 
        receivedChunks: new Set(), 
        endSignalReceived: false,
        lastActivityTime: Date.now(),
        missingChunks: [],
        lastProgressUpdate: Date.now()
      });
    }));
    
    if (!isLocal) {
      await initDB();
      await get().processPendingChunks(fileMeta.transferId);
    }
  },

  addMessage: (message) => set(produce((state: ChatState) => {
    if (!state.chatMessages.some((msg) => msg.id === message.id)) {
      state.chatMessages.push(message);
    }
  })),
  
  // 🔥 핵심 수정: 즉시 업데이트 지원
  updateFileProgress: (transferId, loaded, immediate = false) => {
    const { progressUpdateTimers } = get();
    
    // 기존 타이머 클리어
    const existingTimer = progressUpdateTimers.get(transferId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const doUpdate = () => {
      set(produce((state) => {
        const transfer = state.fileTransfers.get(transferId);
        const message = state.chatMessages.find((m) => m.id === transferId);
        
        if (transfer && message?.fileMeta) {
          const newProgress = Math.min(1, loaded / message.fileMeta.size);
          
          // 부드러운 진행률 업데이트 - 0.1% 이상 변경 시에만 업데이트
          if (Math.abs(newProgress - transfer.progress) > 0.001 || newProgress >= 1) {
            transfer.progress = newProgress;
            transfer.lastActivityTime = Date.now();
            transfer.lastProgressUpdate = Date.now();
            
            // 디버그 로그 (5% 단위로만)
            const prevPercent = Math.floor(transfer.progress * 20);
            const newPercent = Math.floor(newProgress * 20);
            if (prevPercent !== newPercent) {
              console.log(`[FILE_PROGRESS] ${transferId}: ${(newProgress * 100).toFixed(1)}%`);
            }
          }
          
          // 완료 체크
          if (newProgress >= 1 && !transfer.isComplete) {
            transfer.isComplete = true;
            transfer.isSending = false;
            console.log(`[FILE_PROGRESS] Upload complete: ${transferId}`);
          }
        }
        
        // 타이머 정리
        state.progressUpdateTimers.delete(transferId);
      }));
    };
    
    if (immediate) {
      doUpdate(); // 즉시 실행
    } else {
      // 송신 시 더 빠른 업데이트 (50ms)
      const transfer = get().fileTransfers.get(transferId);
      const delay = transfer?.isSending ? 50 : 100;
      const timer = setTimeout(doUpdate, delay);
      set(produce(state => {
        state.progressUpdateTimers.set(transferId, timer);
      }));
    }
  },
  
  appendFileChunk: async (transferId, index, chunk, senderId, isLastChunk = false) => {
    const { fileTransfers, chatMessages } = get();
    const transfer = fileTransfers.get(transferId);
    const message = chatMessages.find(m => m.id === transferId);
    
    if (!transfer || !message?.fileMeta) {
      console.error(`[FILE_RECEIVE] Transfer or message not found: ${transferId}`);
      return;
    }
  
    if (transfer.receivedChunks.has(index)) {
      return;
    }
  
    if (!isValidChunkIndex(index, message.fileMeta.totalChunks)) {
      console.error(`[FILE_RECEIVE] Invalid chunk index: ${index}`);
      return;
    }
  
    if (!isLastChunk && index >= 0) {
      const { sendToPeer } = usePeerConnectionStore.getState();
      const ackMessage = JSON.stringify({
        type: 'file-ack',
        payload: { transferId, chunkIndex: index }
      });
      
      const ackSent = sendToPeer(senderId, ackMessage);
      if (!ackSent) {
        console.warn(`[FILE_RECEIVE] Failed to send ACK for chunk ${index}`);
        setTimeout(() => {
          sendToPeer(senderId, ackMessage);
        }, 100);
      }
    }
  
    if (!isLastChunk && index >= 0) {
      saveChunk(transferId, index, chunk).catch(error => {
        console.error(`[FILE_RECEIVE] Failed to save chunk ${index}:`, error);
      });
    }
  
    set(produce((state: ChatState) => {
      const transfer = state.fileTransfers.get(transferId);
      if (!transfer) return;
  
      transfer.receivedChunks.add(index);
      
      const message = state.chatMessages.find(m => m.id === transferId);
      if (message?.fileMeta) {
        const receivedCount = transfer.receivedChunks.size;
        const totalCount = message.fileMeta.totalChunks;
        
        const rawProgress = receivedCount / totalCount;
        const smoothedProgress = transfer.progress * 0.3 + rawProgress * 0.7;
        
        transfer.progress = Math.min(smoothedProgress, rawProgress);
        transfer.lastActivityTime = Date.now();
        
        if (Math.floor(rawProgress * 20) !== Math.floor((transfer.progress || 0) * 20)) {
          console.log(
            `[FILE_RECEIVE] Progress: ${(rawProgress * 100).toFixed(1)}% ` +
            `(${receivedCount}/${totalCount} chunks)`
          );
        }
      }
    }));
    
    const updatedTransfer = get().fileTransfers.get(transferId);
    if (updatedTransfer && message?.fileMeta) {
      const receivedCount = updatedTransfer.receivedChunks.size;
      const totalCount = message.fileMeta.totalChunks;
      
      if (receivedCount === totalCount || updatedTransfer.endSignalReceived) {
        setTimeout(() => {
          get().checkAndAssembleIfComplete(transferId);
        }, 100);
      }
    }
  },

  checkAndAssembleIfComplete: async (transferId) => {
    const state = get();
    const transfer = state.fileTransfers.get(transferId);
    const message = state.chatMessages.find(m => m.id === transferId);

    if (!transfer || !message?.fileMeta || transfer.isComplete) {
      return;
    }

    const receivedCount = transfer.receivedChunks.size;
    const totalCount = message.fileMeta.totalChunks;
    
    console.log(`[FILE_RECEIVE] Checking completion for ${transferId}:`);
    console.log(`  - Received: ${receivedCount}/${totalCount} chunks`);
    console.log(`  - End Signal: ${transfer.endSignalReceived}`);
    console.log(`  - Missing chunks: ${transfer.missingChunks?.length || 0}`);

    const shouldAssemble = 
      (transfer.endSignalReceived && receivedCount === totalCount) ||
      (receivedCount === totalCount) ||
      (transfer.endSignalReceived && receivedCount >= totalCount - 1);

    if (shouldAssemble) {
      console.log(`[FILE_RECEIVE] Starting assembly for ${transferId}`);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      try {
        const blob = await getAndAssembleFile(transferId, message.fileMeta.type);
        if (blob && blob.size > 0) {
          console.log(`[FILE_RECEIVE] File assembled successfully: ${transferId}`);
          console.log(`  - Expected size: ${message.fileMeta.size}`);
          console.log(`  - Actual size: ${blob.size}`);
          
          const sizeDiff = Math.abs(blob.size - message.fileMeta.size);
          const sizeMatch = sizeDiff < 1024;
          
          if (!sizeMatch) {
            console.warn(`[FILE_RECEIVE] Size mismatch! Expected: ${message.fileMeta.size}, Got: ${blob.size}`);
          }
          
          set(produce(s => {
            const t = s.fileTransfers.get(transferId);
            if (t) {
              t.isComplete = true;
              t.isReceiving = false;
              t.blobUrl = URL.createObjectURL(blob);
              t.progress = 1;
              console.log(`[FILE_RECEIVE] Transfer marked as complete: ${transferId}`);
            }
            
            s.endSignalsReceived.delete(transferId);
          }));
          
          setTimeout(() => {
            deleteFileChunks(transferId).catch(error => {
              console.error(`[FILE_RECEIVE] Failed to delete chunks:`, error);
            });
          }, 1000);
        } else {
          console.error(`[FILE_RECEIVE] Failed to assemble file or empty blob: ${transferId}`);
        }
      } catch (error) {
        console.error(`[FILE_RECEIVE] Assembly error for ${transferId}:`, error);
      }
    } else {
      const inactiveTime = Date.now() - transfer.lastActivityTime;
      if (inactiveTime > 30000) {
        console.error(`[FILE_RECEIVE] Transfer timeout for ${transferId}`);
        set(produce(s => {
          const t = s.fileTransfers.get(transferId);
          if (t) {
            t.isReceiving = false;
          }
          s.endSignalsReceived.delete(transferId);
        }));
        
        setTimeout(() => {
          deleteFileChunks(transferId).catch(error => {
            console.error(`[FILE_RECEIVE] Failed to delete chunks after timeout:`, error);
          });
        }, 1000);
      } else if (transfer.missingChunks && transfer.missingChunks.length > 0) {
        console.log(`[FILE_RECEIVE] Waiting for ${transfer.missingChunks.length} missing chunks...`);
      }
    }
  },

  setTypingState: (userId, nickname, isTyping) => set(produce((state: ChatState) => {
    if (isTyping) { 
      state.isTyping.set(userId, nickname); 
    } else { 
      state.isTyping.delete(userId); 
    }
  })),
  
  applyRemoteDrawEvent: (event) => {
    useWhiteboardStore.getState().applyRemoteDrawEvent(event);
  },

  clearChat: () => {
    const { progressUpdateTimers } = get();
    progressUpdateTimers.forEach(timer => clearTimeout(timer));
    
    get().fileTransfers.forEach(transfer => {
      if (transfer.blobUrl) {
        URL.revokeObjectURL(transfer.blobUrl);
      }
    });
    
    set({ 
      chatMessages: [], 
      isTyping: new Map(), 
      fileTransfers: new Map(), 
      pendingChunks: new Map(),
      endSignalsReceived: new Set(),
      progressUpdateTimers: new Map()
    });
  },
}));
