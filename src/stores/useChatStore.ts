import { create } from 'zustand';
import { produce } from 'immer';
import { useWhiteboardStore } from './useWhiteboardStore';
import { initDB, saveChunk, getAndAssembleFile, deleteFileChunks } from '@/lib/indexedDBHelper';
import { usePeerConnectionStore } from './usePeerConnectionStore';

export interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
}

export interface FileTransferProgress {
  progress: number; // 0 to 1
  isSending: boolean;
  isReceiving: boolean;
  isComplete: boolean;
  blobUrl?: string;
  senderId: string;
  receivedChunks: Set<number>;
  endSignalReceived: boolean;
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
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => Promise<void>;
  updateFileProgress: (transferId: string, loaded: number) => void;
  appendFileChunk: (transferId: string, index: number, chunk: ArrayBuffer, isLastChunk?: boolean) => Promise<void>;
  addPendingChunk: (peerId: string, chunk: ArrayBuffer) => void;
  processPendingChunks: (peerId: string, transferId: string) => Promise<void>;
  handleIncomingChunk: (peerId: string, receivedData: ArrayBuffer | Uint8Array) => Promise<void>;
  checkAndAssembleIfComplete: (transferId: string) => void;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  applyRemoteDrawEvent: (event: any) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),
  pendingChunks: new Map(),

  handleIncomingChunk: async (peerId, receivedData) => {
    const chunkBuffer = (receivedData instanceof Uint8Array)
        ? receivedData.slice().buffer
        : receivedData;

    if (!(chunkBuffer instanceof ArrayBuffer) || chunkBuffer.byteLength < 1) {
        return;
    }

    const { fileTransfers, chatMessages, appendFileChunk, addPendingChunk } = get();
    const receivingTransfer = Array.from(fileTransfers.entries()).find(([transferId, v]) => {
        const message = chatMessages.find(m => m.id === transferId);
        return message && message.senderId === peerId && v.isReceiving && !v.isComplete;
    });

    if (receivingTransfer) {
        const transferId = receivingTransfer[0];
        const view = new DataView(chunkBuffer);
        const type = view.getUint8(0);

        if (type === 1 && chunkBuffer.byteLength >= 5) {
            const index = view.getUint32(1);
            const chunk = chunkBuffer.slice(5);
            await appendFileChunk(transferId, index, chunk, false);
        } else if (type === 2) {
            await appendFileChunk(transferId, -1, new ArrayBuffer(0), true);
        }
    } else {
        addPendingChunk(peerId, chunkBuffer);
    }
  },

  addPendingChunk: (peerId, chunk) => set(produce((state: ChatState) => {
    if (!state.pendingChunks.has(peerId)) {
      state.pendingChunks.set(peerId, []);
    }
    state.pendingChunks.get(peerId)!.push(chunk);
  })),

  processPendingChunks: async (peerId, transferId) => {
    const pending = get().pendingChunks.get(peerId);
    if (pending && pending.length > 0) {
      for (const chunkBuffer of pending) {
        const view = new DataView(chunkBuffer);
        const type = view.getUint8(0);
        if (type === 1 && chunkBuffer.byteLength >= 5) {
          const index = view.getUint32(1);
          const chunk = chunkBuffer.slice(5);
          await get().appendFileChunk(transferId, index, chunk, false);
        } else if (type === 2) {
          await get().appendFileChunk(transferId, -1, new ArrayBuffer(0), true);
        }
      }
      set(produce((state: ChatState) => { state.pendingChunks.delete(peerId); }));
    }
  },

  addFileMessage: async (senderId, senderNickname, fileMeta, isLocal = false) => {
    set(produce((state: ChatState) => {
      const newFileMessage: ChatMessage = { id: fileMeta.transferId, type: 'file', fileMeta, senderId, senderNickname, timestamp: Date.now() };
      if (!state.chatMessages.some(msg => msg.id === newFileMessage.id)) {
        state.chatMessages.push(newFileMessage);
      }
      state.fileTransfers.set(fileMeta.transferId, {
        progress: 0, isSending: isLocal, isReceiving: !isLocal, isComplete: false,
        senderId, receivedChunks: new Set(), endSignalReceived: false,
      });
    }));
    
    if (!isLocal) {
      await initDB();
      await get().processPendingChunks(senderId, fileMeta.transferId);
    }
  },

  addMessage: (message) => set(produce((state: ChatState) => {
    if (!state.chatMessages.some((msg) => msg.id === message.id)) {
      state.chatMessages.push(message);
    }
  })),
  
  updateFileProgress: (transferId, loaded) => {
      set(produce((state) => {
        const transfer = state.fileTransfers.get(transferId);
        const message = state.chatMessages.find((m) => m.id === transferId);
        if (transfer && message?.fileMeta) {
          transfer.progress = loaded / message.fileMeta.size;
        }
      }));
  },
  
  appendFileChunk: async (transferId, index, chunk, isLastChunk = false) => {
    if (!isLastChunk) {
      await saveChunk(transferId, index, chunk);
      const { sendToAllPeers } = usePeerConnectionStore.getState();
      sendToAllPeers(JSON.stringify({
          type: 'file-ack',
          payload: { transferId, chunkIndex: index }
      }));
    }

    set(produce((state: ChatState) => {
      const transfer = state.fileTransfers.get(transferId);
      if (!transfer) return;

      if (isLastChunk) {
        transfer.endSignalReceived = true;
      } else {
        transfer.receivedChunks.add(index);
      }

      const message = state.chatMessages.find(m => m.id === transferId);
      if (message?.fileMeta) {
        transfer.progress = transfer.receivedChunks.size / message.fileMeta.totalChunks;
      }
    }));
    
    get().checkAndAssembleIfComplete(transferId);
  },

  checkAndAssembleIfComplete: (transferId) => {
    setTimeout(async () => {
      const state = get();
      const transfer = state.fileTransfers.get(transferId);
      const message = state.chatMessages.find(m => m.id === transferId);

      if (!transfer || !message?.fileMeta || transfer.isComplete) {
        return;
      }

      if (transfer.endSignalReceived && transfer.receivedChunks.size === message.fileMeta.totalChunks) {
        console.log(`[FILE_RECEIVE] All conditions met! Assembling file: ${transferId}`);
        
        const blob = await getAndAssembleFile(transferId, message.fileMeta.type);
        if (blob) {
          set(produce(s => {
            const t = s.fileTransfers.get(transferId);
            if (t) {
              t.isComplete = true;
              t.isReceiving = false;
              t.blobUrl = URL.createObjectURL(blob);
              t.progress = 1;
            }
          }));
        }
        await deleteFileChunks(transferId);
      }
    }, 0);
  },

  setTypingState: (userId, nickname, isTyping) => set(produce((state: ChatState) => {
    if (isTyping) { state.isTyping.set(userId, nickname); } 
    else { state.isTyping.delete(userId); }
  })),
  
  applyRemoteDrawEvent: (event) => {
    useWhiteboardStore.getState().applyRemoteDrawEvent(event);
  },

  clearChat: () => {
    set({ 
      chatMessages: [], isTyping: new Map(), fileTransfers: new Map(), pendingChunks: new Map(),
    });
  },
}));
