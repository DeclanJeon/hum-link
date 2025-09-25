import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';
import { calculateOptimalChunkSize, calculateTotalChunks, isValidFileType, isValidFileSize } from '@/lib/fileTransferUtils';
import { useChatStore } from './useChatStore';

export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  transcript?: { text: string; isFinal: boolean; lang: string };
}

interface PeerConnectionEvents {
  onData: (peerId: string, data: any) => void;
}

interface FileTransferState {
  transferId: string;
  file: File;
  worker: Worker;
  isPaused: boolean;
  startTime: number;
  metrics?: {
    progress: number;
    speed: number;
    chunksAcked: number;
    totalChunks: number;
    windowSize: number;
  };
}

interface PeerConnectionState {
  webRTCManager: WebRTCManager | null;
  localStream?: MediaStream;
  peers: Map<string, PeerState>;
  activeTransfers: Map<string, FileTransferState>;
}

interface PeerConnectionActions {
  initialize: (localStream: MediaStream, events: PeerConnectionEvents) => void;
  createPeer: (userId: string, nickname: string, initiator: boolean) => void;
  receiveSignal: (from: string, nickname: string, signal: SignalData) => void;
  removePeer: (userId: string) => void;
  sendToAllPeers: (message: any) => { successful: string[], failed: string[] };
  replaceTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream) => void;
  sendFile: (file: File) => Promise<void>;
  cancelFileTransfer: (transferId: string) => void;
  pauseFileTransfer: (transferId: string) => void;
  resumeFileTransfer: (transferId: string) => void;
  cleanup: () => void;
  updatePeerMediaState: (userId: string, kind: 'audio' | 'video', enabled: boolean) => void;
  resolveAck: (transferId: string, chunkIndex: number) => void;
}

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  peers: new Map(),
  activeTransfers: new Map(),

  initialize: (localStream, events) => {
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => useSignalingStore.getState().sendSignal(peerId, signal),
      onConnect: (peerId) => {
        set(produce(state => {
          if (state.peers.has(peerId)) {
            state.peers.get(peerId)!.connectionState = 'connected';
          }
        }));
      },
      onStream: (peerId, stream) => {
        set(produce(state => {
          if (state.peers.has(peerId)) {
            state.peers.get(peerId)!.stream = stream;
          }
        }));
      },
      onData: events.onData,
      onClose: (peerId) => get().removePeer(peerId),
      onError: (peerId, error) => {
        console.error(`[PEER_CONNECTION] Error on peer (${peerId}):`, error);
        set(produce(state => {
          if (state.peers.has(peerId)) {
            state.peers.get(peerId)!.connectionState = 'failed';
          }
        }));
      },
      onBufferLow: (peerId) => {
        console.log(`[PEER_CONNECTION] Buffer low for peer ${peerId}`);
      }
    });
    set({ webRTCManager, localStream });
  },

  createPeer: (userId, nickname, initiator) => {
    get().webRTCManager?.createPeer(userId, initiator);
    set(produce(state => {
      state.peers.set(userId, {
        userId,
        nickname,
        audioEnabled: true,
        videoEnabled: true,
        isSharingScreen: false,
        connectionState: 'connecting'
      });
    }));
  },

  receiveSignal: (from, nickname, signal) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) return;
    
    if (peers.has(from)) {
      webRTCManager.signalPeer(from, signal);
    } else {
      const peer = webRTCManager.createPeer(from, false);
      peer.signal(signal);
      set(produce(state => {
        state.peers.set(from, {
          userId: from,
          nickname,
          audioEnabled: true,
          videoEnabled: true,
          isSharingScreen: false,
          connectionState: 'connecting'
        });
      }));
    }
  },

  removePeer: (userId) => {
    // 해당 피어의 활성 전송 취소
    const { activeTransfers } = get();
    activeTransfers.forEach((transfer, transferId) => {
      const peers = get().peers;
      const peer = peers.get(userId);
      if (peer) {
        // 해당 피어와 관련된 전송만 취소
        console.log(`[PEER_CONNECTION] Cancelling transfers for disconnected peer ${userId}`);
      }
    });

    get().webRTCManager?.removePeer(userId);
    set(produce(state => {
      state.peers.delete(userId);
    }));
  },

  sendToAllPeers: (message) => {
    return get().webRTCManager?.sendToAllPeers(message) ?? { successful: [], failed: [] };
  },

  replaceTrack: (oldTrack, newTrack, stream) => {
    get().webRTCManager?.replaceTrack(oldTrack, newTrack, stream);
  },

  resolveAck: (transferId, chunkIndex) => {
    const transfer = get().activeTransfers.get(transferId);
    if (transfer?.worker) {
      transfer.worker.postMessage({
        type: 'ack-received',
        payload: { transferId, chunkIndex }
      });
    }
  },

  sendFile: async (file: File) => {
    const { webRTCManager, sendToAllPeers, activeTransfers } = get();
    const { addFileMessage, updateFileProgress } = useChatStore.getState();

    if (!webRTCManager) {
      console.error("[FILE_TRANSFER] WebRTCManager is not initialized.");
      return;
    }

    // 파일 유효성 검증
    if (!isValidFileType(file)) {
      console.error("[FILE_TRANSFER] Invalid file type.");
      // TODO: Toast notification
      return;
    }

    if (!isValidFileSize(file.size)) {
      console.error("[FILE_TRANSFER] File size exceeds limit (500MB).");
      // TODO: Toast notification
      return;
    }

    // 동적 청크 크기 계산
    const chunkSize = calculateOptimalChunkSize(file.size);
    const totalChunks = calculateTotalChunks(file.size, chunkSize);
    const transferId = `${file.name}-${file.size}-${Date.now()}`;
    
    const fileMeta = {
      transferId,
      name: file.name,
      size: file.size,
      type: file.type,
      totalChunks,
      chunkSize
    };

    console.log(`[FILE_TRANSFER] Starting transfer with dynamic chunk size: ${chunkSize} bytes`);

    // UI에 파일 메시지 표시
    await addFileMessage('local-user', 'You', fileMeta, true);
    
    // 다른 피어들에게 파일 전송 시작 알림
    sendToAllPeers(JSON.stringify({ 
      type: 'file-meta', 
      payload: fileMeta 
    }));

    // 웹 워커 생성
    const worker = new Worker(
      new URL('../workers/file.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // 전송 상태 저장
    const transferState: FileTransferState = {
      transferId,
      file,
      worker,
      isPaused: false,
      startTime: Date.now()
    };

    set(produce(state => {
      state.activeTransfers.set(transferId, transferState);
    }));

    // 워커 메시지 핸들러 설정
    worker.onmessage = (event) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case 'chunk-ready':
          const result = sendToAllPeers(payload.chunk);
          if (payload.isRetry) {
            console.log(`[FILE_TRANSFER] Retrying chunk ${payload.chunkIndex}, successful peers: ${result.successful.length}`);
          }
          break;
          
        case 'progress-update':
          updateFileProgress(payload.transferId, payload.loaded);
          
          set(produce(state => {
            const transfer = state.activeTransfers.get(payload.transferId);
            if (transfer) {
              transfer.metrics = {
                progress: payload.progress,
                speed: payload.speed,
                chunksAcked: payload.chunksAcked,
                totalChunks: payload.totalChunks,
                windowSize: payload.windowSize
              };
            }
          }));
          
          if (payload.chunksAcked % 10 === 0 || payload.progress === 1) {
            console.log(
              `[FILE_TRANSFER] Progress: ${(payload.progress * 100).toFixed(1)}%, ` +
              `Chunks: ${payload.chunksAcked}/${payload.totalChunks}, ` +
              `Window: ${payload.windowSize}, ` +
              `Speed: ${(payload.speed / 1024 / 1024).toFixed(2)} MB/s`
            );
          }
          break;
          
        case 'transfer-complete':
          console.log(
            `[FILE_TRANSFER] Transfer complete: ${payload.transferId}, ` +
            `Duration: ${(payload.duration / 1000).toFixed(1)}s, ` +
            `Avg Speed: ${(payload.avgSpeed / 1024 / 1024).toFixed(2)} MB/s`
          );
          
          worker.terminate();
          
          // 정리 전 짧은 지연
          setTimeout(() => {
            set(produce(state => {
              state.activeTransfers.delete(payload.transferId);
            }));
          }, 100);
          break;
          
        case 'transfer-error':
          console.error(`[FILE_TRANSFER] Transfer error for ${payload.transferId}:`, payload.error);
          
          worker.terminate();
          set(produce(state => {
            state.activeTransfers.delete(payload.transferId);
          }));
          
          // TODO: Toast notification for error
          break;
          
        case 'transfer-cancelled':
          console.log(`[FILE_TRANSFER] Transfer cancelled: ${payload.transferId}`);
          set(produce(state => {
            state.activeTransfers.delete(payload.transferId);
          }));
          break;

        case 'transfer-paused':
          console.log(`[FILE_TRANSFER] Transfer paused: ${payload.transferId}`);
          break;

        case 'transfer-resumed':
          console.log(`[FILE_TRANSFER] Transfer resumed: ${payload.transferId}`);
          break;
      }
    };

    worker.onerror = (error) => {
      console.error(`[FILE_TRANSFER] Worker error for ${transferId}:`, error);
      worker.terminate();
      set(produce(state => {
        state.activeTransfers.delete(transferId);
      }));
    };

    // 워커에 파일 전송 시작 명령
    worker.postMessage({
      type: 'start-transfer',
      payload: { file, transferId }
    });
  },

  cancelFileTransfer: (transferId) => {
    const transfer = get().activeTransfers.get(transferId);
    if (transfer?.worker) {
      transfer.worker.postMessage({
        type: 'cancel-transfer',
        payload: { transferId }
      });
      transfer.worker.terminate();
      
      // 확실한 정리를 위한 지연
      setTimeout(() => {
        set(produce(state => {
          state.activeTransfers.delete(transferId);
        }));
      }, 100);
    }
  },

  pauseFileTransfer: (transferId) => {
    const transfer = get().activeTransfers.get(transferId);
    if (transfer?.worker && !transfer.isPaused) {
      transfer.worker.postMessage({
        type: 'pause-transfer',
        payload: { transferId }
      });
      set(produce(state => {
        const t = state.activeTransfers.get(transferId);
        if (t) t.isPaused = true;
      }));
    }
  },

  resumeFileTransfer: (transferId) => {
    const transfer = get().activeTransfers.get(transferId);
    if (transfer?.worker && transfer.isPaused) {
      transfer.worker.postMessage({
        type: 'resume-transfer',
        payload: { transferId }
      });
      set(produce(state => {
        const t = state.activeTransfers.get(transferId);
        if (t) t.isPaused = false;
      }));
    }
  },

  cleanup: () => {
    // 모든 활성 전송 취소
    const { activeTransfers } = get();
    activeTransfers.forEach((transfer, transferId) => {
      if (transfer.worker) {
        transfer.worker.postMessage({
          type: 'cancel-transfer',
          payload: { transferId }
        });
        transfer.worker.terminate();
      }
    });
    
    get().webRTCManager?.destroyAll();
    set({ 
      webRTCManager: null, 
      peers: new Map(), 
      activeTransfers: new Map() 
    });
  },

  updatePeerMediaState: (userId, kind, enabled) => {
    set(produce(state => {
      const peer = state.peers.get(userId);
      if (peer) {
        if (kind === 'audio') {
          peer.audioEnabled = enabled;
        } else if (kind === 'video') {
          peer.videoEnabled = enabled;
        }
      }
    }));
  }
}));
