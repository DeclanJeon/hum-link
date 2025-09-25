import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';
import { useSessionStore } from './useSessionStore';
import { calculateOptimalChunkSize, calculateTotalChunks, isValidFileType, isValidFileSize } from '@/lib/fileTransferUtils';
import { useChatStore } from './useChatStore';
import { toast } from 'sonner';

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

interface FileTransferMetrics {
  progress: number;
  sendProgress: number;
  speed: number;
  sendSpeed: number;
  chunksAcked: number;
  chunksSent: number;
  totalChunks: number;
  windowSize: number;
  inFlight: number;
  lastUpdateTime?: number; // 추가
}

interface FileTransferState {
  transferId: string;
  file: File;
  worker: Worker;
  isPaused: boolean;
  startTime: number;
  metrics: FileTransferMetrics;
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
  sendToPeer: (peerId: string, message: any) => boolean;
  replaceTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream) => void;
  sendFile: (file: File) => Promise<void>;
  cancelFileTransfer: (transferId: string) => void;
  pauseFileTransfer: (transferId: string) => void;
  resumeFileTransfer: (transferId: string) => void;
  cleanup: () => void;
  updatePeerMediaState: (userId: string, kind: 'audio' | 'video', enabled: boolean) => void;
  resolveAck: (transferId: string, chunkIndex: number) => void;
  updateTransferProgress: (transferId: string, metrics: Partial<FileTransferMetrics>) => void; // 새 메서드
  
  // 스트림 관련 새 액션들
  addStreamToAllPeers: (stream: MediaStream) => Promise<void>;
  removeStreamFromAllPeers: (stream: MediaStream) => void;
  replaceStreamTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) => void;
}

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  localStream: null,
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
        // Buffer low event
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
    const { activeTransfers } = get();
    activeTransfers.forEach((transfer, transferId) => {
      const peers = get().peers;
      const peer = peers.get(userId);
      if (peer) {
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

  sendToPeer: (peerId, message) => {
    return get().webRTCManager?.sendToPeer(peerId, message) ?? false;
  },

  replaceTrack: (oldTrack, newTrack, stream) => {
    get().webRTCManager?.replaceTrack(oldTrack, newTrack, stream);
  },

  addStreamToAllPeers: async (stream: MediaStream) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) {
      console.error('[STREAM] WebRTCManager not initialized');
      return;
    }

    // 각 peer에게 스트림 추가
    for (const [peerId, peerState] of peers) {
      try {
        const peer = (webRTCManager as any).peers.get(peerId);
        if (peer && !peer.destroyed) {
          console.log(`[STREAM] Adding stream to peer ${peerId}`);
          
          // Simple-peer의 addStream 메소드 사용
          if (peer.addStream) {
            peer.addStream(stream);
          } else {
            // 또는 트랙별로 추가
            stream.getTracks().forEach(track => {
              peer.addTrack(track, stream);
            });
          }
        }
      } catch (error) {
        console.error(`[STREAM] Failed to add stream to peer ${peerId}:`, error);
      }
    }
    
    console.log(`[STREAM] Stream added to ${peers.size} peers`);
  },

  removeStreamFromAllPeers: (stream: MediaStream) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) return;

    for (const [peerId] of peers) {
      try {
        const peer = (webRTCManager as any).peers.get(peerId);
        if (peer && !peer.destroyed) {
          console.log(`[STREAM] Removing stream from peer ${peerId}`);
          
          if (peer.removeStream) {
            peer.removeStream(stream);
          } else {
            stream.getTracks().forEach(track => {
              peer.removeTrack(track, stream);
            });
          }
        }
      } catch (error) {
        console.error(`[STREAM] Failed to remove stream from peer ${peerId}:`, error);
      }
    }
  },

  replaceStreamTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) => {
    const { webRTCManager, localStream } = get();
    if (!webRTCManager || !localStream) return;

    webRTCManager.replaceTrack(oldTrack, newTrack, localStream);
    console.log('[STREAM] Track replaced in all peer connections');
  },

  resolveAck: (transferId, chunkIndex) => {
    const transfer = get().activeTransfers.get(transferId);
    if (transfer?.worker) {
      transfer.worker.postMessage({
        type: 'ack-received',
        payload: { transferId, chunkIndex }
      });
      
      // ACK 받을 때마다 즉시 메트릭 업데이트
      const newAckedCount = (transfer.metrics.chunksAcked || 0) + 1;
      get().updateTransferProgress(transferId, {
        chunksAcked: newAckedCount,
        progress: newAckedCount / transfer.metrics.totalChunks
      });
    }
  },

  // 새로운 메서드: 진행률 업데이트 전용
  updateTransferProgress: (transferId, metrics) => {
    set(produce(state => {
      const transfer = state.activeTransfers.get(transferId);
      if (transfer) {
        // 메트릭 업데이트
        transfer.metrics = {
          ...transfer.metrics,
          ...metrics,
          lastUpdateTime: Date.now()
        };
        
        // 디버그 로그
        const progress = metrics.progress || transfer.metrics.progress;
        if (progress > 0) {
          console.log(`[TRANSFER_PROGRESS] ${transferId}: ${(progress * 100).toFixed(1)}% (${transfer.metrics.chunksAcked}/${transfer.metrics.totalChunks})`);
        }
      }
    }));
    
    // ChatStore도 즉시 업데이트
    const transfer = get().activeTransfers.get(transferId);
    if (transfer && metrics.progress !== undefined) {
      const { updateFileProgress } = useChatStore.getState();
      const bytesTransferred = metrics.progress * transfer.file.size;
      updateFileProgress(transferId, bytesTransferred, true);
    }
  },

  sendFile: async (file: File) => {
    const { webRTCManager, sendToAllPeers } = get();
    const { addFileMessage } = useChatStore.getState();
    const sessionInfo = useSessionStore.getState().getSessionInfo();

    if (!webRTCManager) {
      console.error("[FILE_TRANSFER] WebRTCManager is not initialized.");
      return;
    }

    if (!sessionInfo) {
      console.error("[FILE_TRANSFER] No session info available.");
      return;
    }

    if (!isValidFileType(file)) {
      console.error("[FILE_TRANSFER] Invalid file type.");
      toast.error("This file type is not allowed for security reasons.");
      return;
    }

    if (!isValidFileSize(file.size)) {
      console.error("[FILE_TRANSFER] File size exceeds limit (50GB).");
      toast.error("File size exceeds the maximum limit of 50GB.");
      return;
    }

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

    console.log(`[FILE_TRANSFER] Starting transfer: ${file.name} (${(file.size/1024/1024).toFixed(2)}MB, ${totalChunks} chunks)`);

    // UI 업데이트 - 파일 메시지 추가
    await addFileMessage(sessionInfo.userId, sessionInfo.nickname, fileMeta, true);
    
    // 다른 피어들에게 파일 메타데이터 전송
    sendToAllPeers(JSON.stringify({ 
      type: 'file-meta', 
      payload: fileMeta 
    }));

    // Worker 생성
    const worker = new Worker(
      new URL('../workers/file.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // 초기 메트릭스
    const initialMetrics: FileTransferMetrics = {
      progress: 0,
      sendProgress: 0,
      speed: 0,
      sendSpeed: 0,
      chunksAcked: 0,
      chunksSent: 0,
      totalChunks,
      windowSize: 10,
      inFlight: 0,
      lastUpdateTime: Date.now()
    };
    
    const transferState: FileTransferState = {
      transferId,
      file,
      worker,
      isPaused: false,
      startTime: Date.now(),
      metrics: initialMetrics
    };
    
    set(produce(state => {
      state.activeTransfers.set(transferId, transferState);
    }));

    // Worker 메시지 핸들러
    worker.onmessage = async (event) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case 'chunk-ready':
          // 청크 전송
          if (payload.needsFlowControl) {
            const { webRTCManager } = get();
            const peers = Array.from(get().peers.keys());
            
            for (const peerId of peers) {
              const success = await webRTCManager?.sendWithFlowControl(
                peerId, 
                payload.chunk,
                5000
              ) ?? false;
              
              if (!success) {
                console.warn(`[FILE_TRANSFER] Buffer full for peer ${peerId}, retrying...`);
                setTimeout(() => {
                  webRTCManager?.sendToPeer(peerId, payload.chunk);
                }, 100);
              }
            }
          } else {
            const result = sendToAllPeers(payload.chunk);
            if (payload.isRetry && result.failed.length > 0) {
              console.log(`[FILE_TRANSFER] Retry failed for ${result.failed.length} peers`);
            }
          }
          
          // 청크 전송할 때마다 sendProgress 업데이트
          if (payload.chunkIndex !== undefined) {
            const transfer = get().activeTransfers.get(payload.transferId);
            if (transfer) {
              const newSentCount = (transfer.metrics.chunksSent || 0) + 1;
              get().updateTransferProgress(payload.transferId, {
                chunksSent: newSentCount,
                sendProgress: newSentCount / transfer.metrics.totalChunks
              });
            }
          }
          break;
          
        case 'progress-update':
          // Worker에서 오는 진행률 업데이트를 즉시 반영
          get().updateTransferProgress(payload.transferId, {
            progress: payload.progress,
            sendProgress: payload.sendProgress,
            speed: payload.speed,
            sendSpeed: payload.sendSpeed,
            chunksAcked: payload.chunksAcked,
            chunksSent: payload.chunksSent,
            windowSize: payload.windowSize,
            inFlight: payload.inFlight
          });
          break;
          
        case 'transfer-complete':
          console.log(
            `[FILE_TRANSFER] Complete: ${payload.transferId}, ` +
            `Duration: ${(payload.duration / 1000).toFixed(1)}s, ` +
            `Speed: ${(payload.avgSpeed / 1024 / 1024).toFixed(2)} MB/s`
          );
          
          // 완료 상태 업데이트
          get().updateTransferProgress(payload.transferId, {
            progress: 1,
            sendProgress: 1,
            chunksAcked: payload.totalChunks,
            chunksSent: payload.totalChunks
          });
          
          // Worker 종료
          worker.terminate();
          
          // 잠시 후 activeTransfer 정리
          setTimeout(() => {
            set(produce(state => {
              state.activeTransfers.delete(payload.transferId);
            }));
          }, 500);
          
          toast.success("File sent successfully!");
          break;
          
        case 'transfer-error':
          console.error(`[FILE_TRANSFER] Error: ${payload.error}`);
          toast.error(`Transfer failed: ${payload.error}`);
          
          worker.terminate();
          set(produce(state => {
            state.activeTransfers.delete(payload.transferId);
          }));
          break;
          
        case 'transfer-cancelled':
          console.log(`[FILE_TRANSFER] Cancelled: ${payload.transferId}`);
          toast.info("Transfer cancelled");
          
          set(produce(state => {
            state.activeTransfers.delete(payload.transferId);
          }));
          break;
    
        case 'transfer-paused':
          console.log(`[FILE_TRANSFER] Paused: ${payload.transferId}`);
          toast.info("Transfer paused");
          break;
    
        case 'transfer-resumed':
          console.log(`[FILE_TRANSFER] Resumed: ${payload.transferId}`);
          toast.info("Transfer resumed");
          break;
          
        case 'check-buffer':
          const canSend = get().webRTCManager?.getConnectedPeerIds().length > 0;
          worker.postMessage({
            type: 'buffer-status',
            payload: { canSend }
          });
          break;
          
        case 'debug-log':
          // Worker에서 오는 디버그 로그
          console.log(`[WORKER] ${payload.message}`);
          break;
      }
    };

    worker.onerror = (error) => {
      console.error(`[FILE_TRANSFER] Worker error:`, error);
      toast.error("Transfer worker error");
      worker.terminate();
      set(produce(state => {
        state.activeTransfers.delete(transferId);
      }));
    };

    // Worker 시작
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