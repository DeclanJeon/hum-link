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
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  addFileMessage: (senderId: string, senderNickname: string, fileMeta: FileMetadata, isLocal?: boolean) => Promise<void>;
  updateFileProgress: (transferId: string, loaded: number) => void;
  appendFileChunk: (transferId: string, index: number, chunk: ArrayBuffer, isLastChunk?: boolean) => Promise<void>;
  addPendingChunk: (peerId: string, chunk: ArrayBuffer) => void;
  processPendingChunks: (peerId: string, transferId: string) => Promise<void>;
  handleIncomingChunk: (peerId: string, receivedData: ArrayBuffer | Uint8Array) => Promise<void>;
  checkAndAssembleIfComplete: (transferId: string) => Promise<void>;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  applyRemoteDrawEvent: (event: any) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  chatMessages: [],
  isTyping: new Map(),
  fileTransfers: new Map(),
  pendingChunks: new Map(),
  endSignalsReceived: new Set(),

  handleIncomingChunk: async (peerId, receivedData) => {
    const chunkBuffer = (receivedData instanceof Uint8Array)
        ? receivedData.slice().buffer
        : receivedData;

    if (!(chunkBuffer instanceof ArrayBuffer) || chunkBuffer.byteLength < 1) {
        console.warn('[FILE_RECEIVE] Invalid chunk buffer received');
        return;
    }

    const { fileTransfers, chatMessages, appendFileChunk, addPendingChunk, endSignalsReceived } = get();
    
    // 현재 수신 중인 전송 찾기
    const receivingTransfer = Array.from(fileTransfers.entries()).find(([transferId, v]) => {
        const message = chatMessages.find(m => m.id === transferId);
        return message && message.senderId === peerId && v.isReceiving && !v.isComplete;
    });

    if (receivingTransfer) {
        const transferId = receivingTransfer[0];
        const view = new DataView(chunkBuffer);
        const type = view.getUint8(0);

        if (type === 1 && chunkBuffer.byteLength >= 5) {
            // 데이터 청크
            const index = view.getUint32(1);
            const chunk = chunkBuffer.slice(5);
            
            // 청크 인덱스 유효성 검증
            const message = chatMessages.find(m => m.id === transferId);
            if (message?.fileMeta && !isValidChunkIndex(index, message.fileMeta.totalChunks)) {
                console.error(`[FILE_RECEIVE] Invalid chunk index: ${index} for transfer ${transferId}`);
                return;
            }
            
            console.log(`[FILE_RECEIVE] Data chunk received: ${index} for ${transferId}, size: ${chunk.byteLength}`);
            
            // 즉시 처리
            await appendFileChunk(transferId, index, chunk, false);
            
        } else if (type === 2) {
            // End Signal - 중복 처리 방지
            if (!endSignalsReceived.has(transferId)) {
                endSignalsReceived.add(transferId);
                console.log(`[FILE_RECEIVE] End signal received for ${transferId}`);
                
                set(produce((state: ChatState) => {
                    const transfer = state.fileTransfers.get(transferId);
                    if (transfer) {
                        transfer.endSignalReceived = true;
                    }
                }));
                
                // 1초 후 완료 체크
                setTimeout(() => {
                    get().checkAndAssembleIfComplete(transferId);
                }, 1000);
            } else {
                console.log(`[FILE_RECEIVE] Duplicate End signal ignored for ${transferId}`);
            }
        }
    } else {
        console.log('[FILE_RECEIVE] No active transfer found, adding to pending chunks');
        addPendingChunk(peerId, chunkBuffer);
    }
  },

  addPendingChunk: (peerId, chunk) => set(produce((state: ChatState) => {
    if (!state.pendingChunks.has(peerId)) {
      state.pendingChunks.set(peerId, []);
    }
    state.pendingChunks.get(peerId)!.push(chunk);
    
    // 펜딩 청크가 너무 많이 쌓이지 않도록 제한
    const pending = state.pendingChunks.get(peerId)!;
    if (pending.length > 1000) {
      console.warn(`[FILE_RECEIVE] Too many pending chunks for ${peerId}, clearing old ones`);
      state.pendingChunks.set(peerId, pending.slice(-500));
    }
  })),

  processPendingChunks: async (peerId, transferId) => {
    const pending = get().pendingChunks.get(peerId);
    if (pending && pending.length > 0) {
      console.log(`[FILE_RECEIVE] Processing ${pending.length} pending chunks for ${transferId}`);
      
      const { chatMessages, endSignalsReceived } = get();
      const message = chatMessages.find(m => m.id === transferId);
      
      for (const chunkBuffer of pending) {
        const view = new DataView(chunkBuffer);
        const type = view.getUint8(0);
        
        if (type === 1 && chunkBuffer.byteLength >= 5) {
          const index = view.getUint32(1);
          
          // 청크 인덱스 유효성 검증
          if (message?.fileMeta && !isValidChunkIndex(index, message.fileMeta.totalChunks)) {
            console.error(`[FILE_RECEIVE] Invalid pending chunk index: ${index}`);
            continue;
          }
          
          const chunk = chunkBuffer.slice(5);
          await get().appendFileChunk(transferId, index, chunk, false);
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
        state.pendingChunks.delete(peerId); 
      }));
      
      // 처리 후 완료 체크
      setTimeout(() => {
        get().checkAndAssembleIfComplete(transferId);
      }, 500);
    }
  },

  addFileMessage: async (senderId, senderNickname, fileMeta, isLocal = false) => {
    console.log(`[FILE_RECEIVE] Adding file message: ${fileMeta.transferId}, isLocal: ${isLocal}, totalChunks: ${fileMeta.totalChunks}`);
    
    // 중복 메시지 방지
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
        missingChunks: []
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
          transfer.lastActivityTime = Date.now();
        }
      }));
  },
  
  appendFileChunk: async (transferId, index, chunk, isLastChunk = false) => {
    const { fileTransfers, chatMessages } = get();
    const transfer = fileTransfers.get(transferId);
    const message = chatMessages.find(m => m.id === transferId);
    
    if (!transfer || !message?.fileMeta) {
      console.error(`[FILE_RECEIVE] Transfer or message not found: ${transferId}`);
      return;
    }

    // 중복 청크 체크
    if (transfer.receivedChunks.has(index)) {
      console.log(`[FILE_RECEIVE] Duplicate chunk ignored: ${index}`);
      return;
    }

    // 청크 인덱스 유효성 재검증
    if (!isValidChunkIndex(index, message.fileMeta.totalChunks)) {
      console.error(`[FILE_RECEIVE] Invalid chunk index in appendFileChunk: ${index}`);
      return;
    }

    // ACK 전송 (End Signal 제외)
    if (!isLastChunk && index >= 0) {
      const { sendToAllPeers } = usePeerConnectionStore.getState();
      const ackMessage = JSON.stringify({
          type: 'file-ack',
          payload: { transferId, chunkIndex: index }
      });
      sendToAllPeers(ackMessage);
      console.log(`[FILE_RECEIVE] ACK sent for chunk ${index}`);
    }

    // 청크 저장
    if (!isLastChunk && index >= 0) {
      try {
        await saveChunk(transferId, index, chunk);
        console.log(`[FILE_RECEIVE] Chunk ${index} saved to IndexedDB`);
      } catch (error) {
        console.error(`[FILE_RECEIVE] Failed to save chunk ${index}:`, error);
        return;
      }
    }

    set(produce((state: ChatState) => {
      const transfer = state.fileTransfers.get(transferId);
      if (!transfer) return;

      if (!isLastChunk && index >= 0) {
        transfer.receivedChunks.add(index);
        console.log(`[FILE_RECEIVE] Chunk ${index} added, total received: ${transfer.receivedChunks.size}`);
      }

      const message = state.chatMessages.find(m => m.id === transferId);
      if (message?.fileMeta) {
        const receivedCount = transfer.receivedChunks.size;
        const totalCount = message.fileMeta.totalChunks;
        transfer.progress = receivedCount / totalCount;
        
        // 진행 상황 로그
        if (receivedCount % 50 === 0 || receivedCount === totalCount) {
          console.log(`[FILE_RECEIVE] Progress: ${receivedCount}/${totalCount} chunks (${(transfer.progress * 100).toFixed(1)}%)`);
        }
        
        // 누락된 청크 확인
        if (receivedCount < totalCount) {
          const missing: number[] = [];
          for (let i = 0; i < totalCount; i++) {
            if (!transfer.receivedChunks.has(i)) {
              missing.push(i);
            }
          }
          transfer.missingChunks = missing;
          
          if (missing.length > 0 && missing.length <= 10) {
            console.log(`[FILE_RECEIVE] Missing chunks: ${missing.join(', ')}`);
          }
        } else {
          transfer.missingChunks = [];
        }
      }
      
      transfer.lastActivityTime = Date.now();
    }));
    
    // 주기적으로 완료 체크
    const updatedTransfer = get().fileTransfers.get(transferId);
    const updatedMessage = get().chatMessages.find(m => m.id === transferId);
    
    if (updatedTransfer && updatedMessage?.fileMeta) {
      const receivedCount = updatedTransfer.receivedChunks.size;
      const totalCount = updatedMessage.fileMeta.totalChunks;
      
      // 모든 청크를 받았거나, End Signal을 받았을 때 체크
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

    // 두 조건 중 하나만 만족해도 시도
    const shouldAssemble = 
      (transfer.endSignalReceived && receivedCount === totalCount) || // 정상 케이스
      (receivedCount === totalCount) || // End Signal 없이 모든 청크 받음
      (transfer.endSignalReceived && receivedCount >= totalCount - 1); // 마지막 청크 1개 누락 허용

    if (shouldAssemble) {
      console.log(`[FILE_RECEIVE] Starting assembly for ${transferId}`);
      
      // 조립 전 짧은 지연 (IndexedDB 쓰기 완료 대기)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      try {
        const blob = await getAndAssembleFile(transferId, message.fileMeta.type);
        if (blob && blob.size > 0) {
          console.log(`[FILE_RECEIVE] File assembled successfully: ${transferId}`);
          console.log(`  - Expected size: ${message.fileMeta.size}`);
          console.log(`  - Actual size: ${blob.size}`);
          
          // 크기 검증 (약간의 오차 허용)
          const sizeDiff = Math.abs(blob.size - message.fileMeta.size);
          const sizeMatch = sizeDiff < 1024; // 1KB 오차 허용
          
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
            
            // End Signal 정리
            s.endSignalsReceived.delete(transferId);
          }));
          
          // IndexedDB 청크 삭제
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
      // 타임아웃 체크
      const inactiveTime = Date.now() - transfer.lastActivityTime;
      if (inactiveTime > 30000) {
        console.error(`[FILE_RECEIVE] Transfer timeout for ${transferId}`);
        set(produce(s => {
          const t = s.fileTransfers.get(transferId);
          if (t) {
            t.isReceiving = false;
          }
          // 타임아웃 시 End Signal 정리
          s.endSignalsReceived.delete(transferId);
        }));
        
        // 타임아웃 시 청크 정리
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
    // Blob URL 정리
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
      endSignalsReceived: new Set()
    });
  },
}));
