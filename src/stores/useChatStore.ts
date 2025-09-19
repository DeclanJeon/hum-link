import { create } from 'zustand';
import { produce } from 'immer';
import { useWhiteboardStore } from './useWhiteboardStore'; // 순환 참조를 피하기 위해 타입만 임포트하거나 동적 임포트 고려

// 파일 메타데이터
export interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
}

// 파일 전송 진행 상태
export interface FileTransferProgress {
  progress: number; // 0 to 1
  isSending: boolean;
  isReceiving: boolean;
  isComplete: boolean;
  blobUrl?: string; // 다운로드용 URL
}

// 메시지 타입
export type MessageType = 'text' | 'file';

// 채팅 메시지 구조
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
  isTyping: Map<string, string>; // userId, nickname
  fileTransfers: Map<string, FileTransferProgress>;
  receivedFileChunks: Map<string, ArrayBuffer[]>;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => void;
  updateFileProgress: (transferId: string, loaded: number) => void;
  appendFileChunk: (transferId: string, chunk: ArrayBuffer, isLast: boolean) => void;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  applyRemoteDrawEvent: (event: any) => void; // 화이트보드 이벤트를 적용하는 액션 추가
  clearChat: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),
  receivedFileChunks: new Map(),

  addMessage: (message) => set(produce((state: ChatState) => {
    if (!state.chatMessages.some((msg) => msg.id === message.id)) {
      state.chatMessages.push(message);
    }
  })),

  addFileMessage: (senderId, senderNickname, fileMeta, isLocal = false) => set(produce((state: ChatState) => {
    const newFileMessage: ChatMessage = { id: fileMeta.transferId, type: 'file', fileMeta, senderId, senderNickname, timestamp: Date.now() };
    state.chatMessages.push(newFileMessage);
    state.fileTransfers.set(fileMeta.transferId, { progress: 0, isSending: isLocal, isReceiving: !isLocal, isComplete: false });
    if (!isLocal) {
      state.receivedFileChunks.set(fileMeta.transferId, []);
    }
  })),

  updateFileProgress: (transferId, loaded) => set(produce((state: ChatState) => {
    const transfer = state.fileTransfers.get(transferId);
    const message = state.chatMessages.find((m) => m.id === transferId);
    if (transfer && message?.fileMeta) {
      transfer.progress = loaded / message.fileMeta.size;
    }
  })),
  
  appendFileChunk: (transferId, chunk, isLast) => set(produce((state: ChatState) => {
    let chunks = state.receivedFileChunks.get(transferId);
    if (!chunks) {
      chunks = [];
      state.receivedFileChunks.set(transferId, chunks);
    }
    chunks.push(chunk);

    const message = state.chatMessages.find((m) => m.id === transferId);
    const transfer = state.fileTransfers.get(transferId);
    if (!message?.fileMeta || !transfer) return;

    const loadedSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    transfer.progress = loadedSize / message.fileMeta.size;

    if (isLast) {
      const receivedBlob = new Blob(chunks, { type: message.fileMeta.type });
      transfer.isComplete = true;
      transfer.isReceiving = false;
      transfer.blobUrl = URL.createObjectURL(receivedBlob);
      state.receivedFileChunks.delete(transferId);
    }
  })),

  setTypingState: (userId, nickname, isTyping) => set(produce((state: ChatState) => {
    if (isTyping) {
      state.isTyping.set(userId, nickname);
    } else {
      state.isTyping.delete(userId);
    }
  })),
  
  // 다른 사용자로부터 받은 화이트보드 데이터를 로컬 캔버스에 그립니다.
  applyRemoteDrawEvent: (event) => {
    // 순환 참조를 피하기 위해 스토어 액션 내에서 다른 스토어의 상태를 가져옵니다.
    const { applyRemoteDrawEvent: applyToWhiteboard } = useWhiteboardStore.getState();
    applyToWhiteboard(event);
  },

  clearChat: () => set({ chatMessages: [], isTyping: new Map(), fileTransfers: new Map(), receivedFileChunks: new Map() }),
}));
