import { create, StoreApi } from 'zustand';
import { produce } from 'immer';
import { useWhiteboardStore } from './useWhiteboardStore';

export interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
}

export interface FileTransferProgress {
  progress: number; // 0 to 1
  isSending: boolean;
  isReceiving: boolean;
  isComplete: boolean;
  blobUrl?: string;
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

// ✅ 수정: Zustand 상태와 분리하여 관리할 비-렌더링 상태
const nonReactiveState = {
  receivedFileChunks: new Map<string, ArrayBuffer[]>(),
  lastProgressUpdate: new Map<string, number>(),
};

interface ChatState {
  chatMessages: ChatMessage[];
  isTyping: Map<string, string>;
  fileTransfers: Map<string, FileTransferProgress>;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => void;
  updateFileProgress: (transferId: string, loaded: number) => void;
  appendFileChunk: (transferId: string, chunk: ArrayBuffer, isLast: boolean) => void;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  applyRemoteDrawEvent: (event: any) => void;
  clearChat: () => void;
}

const PROGRESS_UPDATE_THROTTLE = 100;

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),

  addMessage: (message) => set(produce((state: ChatState) => {
    if (!state.chatMessages.some((msg) => msg.id === message.id)) {
      state.chatMessages.push(message);
    }
  })),

  addFileMessage: (senderId, senderNickname, fileMeta, isLocal = false) => {
    set(produce((state: ChatState) => {
      const newFileMessage: ChatMessage = { id: fileMeta.transferId, type: 'file', fileMeta, senderId, senderNickname, timestamp: Date.now() };
      state.chatMessages.push(newFileMessage);
      state.fileTransfers.set(fileMeta.transferId, { progress: 0, isSending: isLocal, isReceiving: !isLocal, isComplete: false });
    }));
    // ✅ 수정: 비-반응형 상태에 초기화
    if (!isLocal) {
      nonReactiveState.receivedFileChunks.set(fileMeta.transferId, []);
    }
    nonReactiveState.lastProgressUpdate.set(fileMeta.transferId, 0);
  },

  updateFileProgress: (transferId, loaded) => {
    const now = Date.now();
    const lastUpdate = nonReactiveState.lastProgressUpdate.get(transferId) || 0;
    const message = get().chatMessages.find((m) => m.id === transferId);
    const isLast = message?.fileMeta ? loaded >= message.fileMeta.size : false;

    if (now - lastUpdate > PROGRESS_UPDATE_THROTTLE || isLast) {
      nonReactiveState.lastProgressUpdate.set(transferId, now);
      set(produce((state) => {
        const transfer = state.fileTransfers.get(transferId);
        if (transfer && message?.fileMeta) {
          transfer.progress = loaded / message.fileMeta.size;
        }
      }));
    }
  },
  
  // ✅ 수정: 'set' 호출을 최소화하는 새로운 로직
  appendFileChunk: (transferId, chunk, isLast) => {
    const now = Date.now();
    const lastUpdate = nonReactiveState.lastProgressUpdate.get(transferId) || 0;
    
    // 1. 청크를 비-반응형 상태에만 축적
    const chunks = nonReactiveState.receivedFileChunks.get(transferId);
    if (!chunks) return;
    chunks.push(chunk);

    const message = get().chatMessages.find((m) => m.id === transferId);
    if (!message?.fileMeta) return;

    // 2. UI 업데이트가 필요한 시점에만 'set' 호출
    if (isLast || now - lastUpdate > PROGRESS_UPDATE_THROTTLE) {
      nonReactiveState.lastProgressUpdate.set(transferId, now);
      
      set(produce((state) => {
        const transfer = state.fileTransfers.get(transferId);
        if (!transfer) return;

        const loadedSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        transfer.progress = loadedSize / (message.fileMeta?.size || 1);

        if (isLast) {
          const receivedBlob = new Blob(chunks, { type: message.fileMeta?.type });
          transfer.isComplete = true;
          transfer.isReceiving = false;
          transfer.blobUrl = URL.createObjectURL(receivedBlob);
          // 3. 완료 후 비-반응형 상태 정리
          nonReactiveState.receivedFileChunks.delete(transferId);
          nonReactiveState.lastProgressUpdate.delete(transferId);
        }
      }));
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
    const { applyRemoteDrawEvent: applyToWhiteboard } = useWhiteboardStore.getState();
    applyToWhiteboard(event);
  },

  clearChat: () => {
    set({ 
      chatMessages: [], 
      isTyping: new Map(), 
      fileTransfers: new Map(),
    });
    // ✅ 수정: 비-반응형 상태도 초기화
    nonReactiveState.receivedFileChunks.clear();
    nonReactiveState.lastProgressUpdate.clear();
  },
}));