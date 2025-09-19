// src/stores/useChatStore.ts
import { create } from 'zustand';
import { produce } from 'immer';
import { useWebRTCStore } from './useWebRTCStore'; // 순환 참조 방지를 위해 타입만 import하는 것이 더 좋을 수 있습니다.

// 파일 메타데이터 타입 정의
export interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
}

// 파일 전송 상태
export interface FileTransferProgress {
  progress: number; // 0 to 1
  isSending: boolean;
  isReceiving: boolean;
  isComplete: boolean;
  blobUrl?: string; // 수신 완료 시 다운로드 URL
}

// 메시지 타입 확장
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
  receivedFileChunks: Map<string, ArrayBuffer[]>;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => void;
  updateFileProgress: (transferId: string, loaded: number) => void;
  appendFileChunk: (transferId: string, chunk: ArrayBuffer, isLast: boolean) => void;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),
  receivedFileChunks: new Map(),

  addMessage: (message) =>
    set(
      produce((state: ChatState) => {
        if (!state.chatMessages.some((msg) => msg.id === message.id)) {
          state.chatMessages.push(message);
        }
      }),
    ),

  addFileMessage: (senderId, senderNickname, fileMeta, isLocal = false) =>
    set(
      produce((state: ChatState) => {
        const newFileMessage: ChatMessage = {
          id: fileMeta.transferId,
          type: 'file',
          fileMeta,
          senderId: senderId,
          senderNickname: senderNickname,
          timestamp: Date.now(),
        };
        state.chatMessages.push(newFileMessage);
        state.fileTransfers.set(fileMeta.transferId, {
          progress: 0,
          isSending: isLocal,
          isReceiving: !isLocal,
          isComplete: false,
        });
        if (!isLocal) {
          state.receivedFileChunks.set(fileMeta.transferId, []);
        }
      }),
    ),

  updateFileProgress: (transferId, loaded) =>
    set(
      produce((state: ChatState) => {
        const transfer = state.fileTransfers.get(transferId);
        const message = state.chatMessages.find((m) => m.id === transferId);
        if (transfer && message && message.fileMeta) {
          transfer.progress = loaded / message.fileMeta.size;
        }
      }),
    ),
  
  // ✅ 여기가 핵심 수정 포인트입니다!
  appendFileChunk: (transferId, chunk, isLast) =>
    set(
      produce((state: ChatState) => {
        // 1. Immer의 'draft' 상태에서 chunks 배열을 가져옵니다.
        let chunks = state.receivedFileChunks.get(transferId);
        if (!chunks) {
          // 만약 배열이 없다면 (이론상 addFileMessage에서 생성되지만, 방어 코드)
          chunks = [];
          state.receivedFileChunks.set(transferId, chunks);
        }
        
        // 2. 'draft' 배열에 chunk를 push합니다. (이제 에러가 발생하지 않습니다)
        chunks.push(chunk);

        const message = state.chatMessages.find((m) => m.id === transferId);
        const transfer = state.fileTransfers.get(transferId);

        if (!message?.fileMeta || !transfer) return;

        const loadedSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        transfer.progress = loadedSize / message.fileMeta.size;

        // 3. 마지막 청크라면, Blob을 생성하고 상태를 업데이트합니다.
        if (isLast) {
          const receivedBlob = new Blob(chunks, { type: message.fileMeta.type });
          transfer.isComplete = true;
          transfer.isReceiving = false;
          transfer.blobUrl = URL.createObjectURL(receivedBlob);
          // 메모리 관리를 위해 사용한 청크 데이터는 삭제합니다.
          state.receivedFileChunks.delete(transferId);
        }
      }),
    ),

  setTypingState: (userId, nickname, isTyping) =>
    set(
      produce((state: ChatState) => {
        if (isTyping) {
          state.isTyping.set(userId, nickname);
        } else {
          state.isTyping.delete(userId);
        }
      }),
    ),
  
  clearChat: () => set({ chatMessages: [], isTyping: new Map(), fileTransfers: new Map(), receivedFileChunks: new Map() }),
}));