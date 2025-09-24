import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';
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

interface PeerConnectionState {
  webRTCManager: WebRTCManager | null;
  localStream?: MediaStream;
  peers: Map<string, PeerState>;
}

interface PeerConnectionActions {
    initialize: (localStream: MediaStream, events: PeerConnectionEvents) => void;
    createPeer: (userId: string, nickname: string, initiator: boolean) => void;
    receiveSignal: (from: string, nickname: string, signal: SignalData) => void;
    removePeer: (userId: string) => void;
    sendToAllPeers: (message: any) => number;
    replaceTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream) => void;
    sendFile: (file: File) => void;
    cleanup: () => void;
    updatePeerMediaState: (userId: string, kind: 'audio' | 'video', enabled: boolean) => void;
}

const FILE_CHUNK_SIZE = 64 * 1024;
// 데이터 채널의 버퍼가 이 값 이상으로 쌓이면 전송을 일시 중지합니다.
const DATA_CHANNEL_BUFFER_THRESHOLD = 256 * 1024; // 256KB로 낮춰 더 민감하게 반응하도록 설정

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  peers: new Map(),

  initialize: (localStream, events) => {
    console.log('[PEER_CONNECTION]  WebRTC   .');
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => {
        console.log(`[PEER_CONNECTION]  WebRTC    (${peerId}) .`);
        useSignalingStore.getState().sendSignal(peerId, signal);
      },
      onConnect: (peerId) => {
        console.log(`[PEER_CONNECTION]  (${peerId}) P2P  .`);
        set(produce(state => {
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'connected';
        }));
      },
      onStream: (peerId, stream) => {
        console.log(`[PEER_CONNECTION]  (${peerId})   .`);
        set(produce(state => {
          const peer = state.peers.get(peerId);
          if (peer) peer.stream = stream;
        }));
      },
      onData: events.onData,
      onClose: (peerId) => {
        console.log(`[PEER_CONNECTION]  (${peerId})  .`);
        get().removePeer(peerId);
      },
      onError: (peerId, error) => {
        console.error(`[PEER_CONNECTION]  (${peerId})    :`, error);
        set(produce(state => {
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'failed';
        }));
      },
    });
    set({ webRTCManager, localStream });
  },

  createPeer: (userId, nickname, initiator) => {
    console.log(`[PEER_CONNECTION]  WebRTC (${userId})  (Initiator: ${initiator})`);
    get().webRTCManager?.createPeer(userId, initiator);
    set(produce(state => {
      state.peers.set(userId, { userId, nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' });
    }));
  },
  
  receiveSignal: (from, nickname, signal) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) return;
    
    console.log(`[PEER_CONNECTION]  (${from})  .`);

    if (peers.has(from)) {
       webRTCManager.signalPeer(from, signal);
    } else {
      console.warn(`[PEER_CONNECTION] :  ,     (${from}).      .`);
      set(produce(state => {
        state.peers.set(from, { userId: from, nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' });
      }));
      webRTCManager.receiveSignal(from, signal);
    }
  },

  removePeer: (userId) => {
    get().webRTCManager?.removePeer(userId);
    set(produce(state => {
      state.peers.delete(userId);
    }));
  },

  sendToAllPeers: (message) => {
    let messageType = 'binary_chunk';
    if (typeof message === 'string') {
        try {
            const parsed = JSON.parse(message);
            messageType = parsed.type || 'json_string';
        } catch (e) {
            messageType = 'text_string';
        }
    }
    
    const sentCount = get().webRTCManager?.sendToAllPeers(message) ?? 0;
    
    if (sentCount > 0 && messageType !== 'binary_chunk') {
        console.log(`[WebRTCManager]  [${messageType}]   ${sentCount}  .`);
    }
    return sentCount;
  },

   replaceTrack: (oldTrack, newTrack, stream) => {
     const { webRTCManager } = get();
     if (webRTCManager) {
       webRTCManager.replaceTrack(oldTrack, newTrack, stream);
     }
   },

  // =================▼▼▼ 최종 수정 지점: 지능형 유량 제어 로직 ▼▼▼=================
  sendFile: (file: File) => {
    const { webRTCManager } = get();
    const { addFileMessage, updateFileProgress } = useChatStore.getState();
    if (!webRTCManager) {
        console.error("[FILE_TRANSFER] WebRTCManager  .");
        return;
    }

    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);
    const transferId = `${file.name}-${file.size}-${Date.now()}`;
    const fileMeta = { transferId, name: file.name, size: file.size, type: file.type, totalChunks };

    addFileMessage('local-user', 'You', fileMeta, true);
    
    const metaMessage = JSON.stringify({ type: 'file-meta', payload: fileMeta });
    webRTCManager.sendToAllPeers(metaMessage);

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) return;

        let offset = 0;
        let chunkIndex = 0;

        const sendChunkLoop = () => {
            if (offset >= buffer.byteLength) {
                const endHeader = new ArrayBuffer(5);
                const endView = new DataView(endHeader);
                endView.setUint8(0, 2);
                webRTCManager.sendToAllPeers(endHeader);
                console.log(`[FILE_TRANSFER]    : ${transferId}`);
                updateFileProgress(transferId, buffer.byteLength); // 전송 완료 시 100%로 설정
                return;
            }

            // 연결된 모든 피어의 버퍼를 확인합니다.
            const connectedPeerIds = webRTCManager.getConnectedPeerIds();
            if (connectedPeerIds.length === 0) {
                console.warn("[FILE_TRANSFER] No connected peers to send file to. Aborting.");
                return;
            }

            // 모든 피어의 버퍼가 임계값 이하일 때만 전송합니다.
            let canSend = true;
            for (const peerId of connectedPeerIds) {
                const bufferedAmount = webRTCManager.getPeerDataChannelBuffer(peerId);
                if (bufferedAmount > DATA_CHANNEL_BUFFER_THRESHOLD) {
                    console.log(`[FILE_TRANSFER] Peer ${peerId} buffer is full (${bufferedAmount} bytes). Pausing.`);
                    canSend = false;
                    break;
                }
            }
            
            if (canSend) {
                const chunk = buffer.slice(offset, offset + FILE_CHUNK_SIZE);
                const header = new ArrayBuffer(5);
                const headerView = new DataView(header);
                headerView.setUint8(0, 1);
                headerView.setUint32(1, chunkIndex);

                const combined = new Uint8Array(header.byteLength + chunk.byteLength);
                combined.set(new Uint8Array(header), 0);
                combined.set(new Uint8Array(chunk), header.byteLength);
                
                webRTCManager.sendToAllPeers(combined.buffer);
                
                offset += chunk.byteLength;
                chunkIndex++;
                updateFileProgress(transferId, offset);
            }

            // setTimeout 대신 requestAnimationFrame을 사용하여 브라우저 렌더링에 맞춰 부드럽게 전송합니다.
            requestAnimationFrame(sendChunkLoop);
        };
        
        requestAnimationFrame(sendChunkLoop);
    };
  },
  // =================▲▲▲ 최종 수정 지점 ▲▲▲=================

  cleanup: () => {
    console.log('[PEER_CONNECTION]   WebRTC    .');
    get().webRTCManager?.destroyAll();
    set({ webRTCManager: null, peers: new Map() });
  },

  updatePeerMediaState: (userId, kind, enabled) => {
    set(produce(state => {
      const peer = state.peers.get(userId);
      if (peer) {
        if (kind === 'audio') peer.audioEnabled = enabled;
        else if (kind === 'video') peer.videoEnabled = enabled;
      }
    }));
  }
}));