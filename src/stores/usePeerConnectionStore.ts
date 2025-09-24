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
    // ✅ 수정: createPeer 시그니처 변경 (initiator 플래그 추가)
    createPeer: (userId: string, nickname: string, initiator: boolean) => void;
    receiveSignal: (from: string, nickname: string, signal: SignalData) => void;
    removePeer: (userId: string) => void;
    sendToAllPeers: (message: any) => number;
    replaceTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream) => void;
    sendFile: (file: File) => void;
    cleanup: () => void;
    updatePeerMediaState: (userId: string, kind: 'audio' | 'video', enabled: boolean) => void;
}

const FILE_CHUNK_SIZE = 16 * 1024; // 16KB

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  peers: new Map(),

  initialize: (localStream, events) => {
    console.log('[PEER_CONNECTION] ⚡️ WebRTC 관리자 초기화 시작.');
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => {
        console.log(`[PEER_CONNECTION] 📤 WebRTC 시그널 생성 및 피어(${peerId})에게 전송.`);
        useSignalingStore.getState().sendSignal(peerId, signal);
      },
      onConnect: (peerId) => {
        console.log(`[PEER_CONNECTION] ✅ 피어(${peerId})와 P2P 연결 성공.`);
        set(produce(state => {
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'connected';
        }));
      },
      onStream: (peerId, stream) => {
        console.log(`[PEER_CONNECTION] 📥 피어(${peerId})로부터 미디어 스트림 수신.`);
        set(produce(state => {
          const peer = state.peers.get(peerId);
          if (peer) peer.stream = stream;
        }));
      },
      onData: events.onData,
      onClose: (peerId) => {
        console.log(`[PEER_CONNECTION] 🚫 피어(${peerId})와의 연결 종료.`);
        get().removePeer(peerId);
      },
      onError: (peerId, error) => {
        console.error(`[PEER_CONNECTION] ❌ 피어(${peerId})와 연결 중 오류 발생:`, error);
        set(produce(state => {
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'failed';
        }));
      },
    });
    set({ webRTCManager, localStream });
  },

  // ✅ 수정: initiator 플래그를 받아 WebRTCManager에 전달
  createPeer: (userId, nickname, initiator) => {
    console.log(`[PEER_CONNECTION] ⚡️ WebRTC 피어(${userId}) 생성 (Initiator: ${initiator})`);
    get().webRTCManager?.createPeer(userId, initiator);
    set(produce(state => {
      state.peers.set(userId, { userId, nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' });
    }));
  },
  
  receiveSignal: (from, nickname, signal) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) return;
    
    console.log(`[PEER_CONNECTION] 📥 피어(${from})로부터 시그널 수신.`);

    // ✅ 수정: receiveSignal은 더 이상 피어를 생성하지 않음. 오직 시그널 전달 역할만 수행.
    if (peers.has(from)) {
       webRTCManager.signalPeer(from, signal);
    } else {
      // 이 경우는 이론적으로 발생하면 안되지만, 방어 코드로 남겨둠
      console.warn(`[PEER_CONNECTION] 경고: 시그널을 수신했으나, 아직 로컬에 생성되지 않은 피어(${from})입니다. 시그널링 순서에 문제가 있을 수 있습니다.`);
      // Glare 방지를 위해 이쪽에서는 항상 non-initiator로 생성 시도
      set(produce(state => {
        state.peers.set(from, { userId: from, nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' });
      }));
      webRTCManager.receiveSignal(from, signal);
    }
  },

  // 이 함수는 이제 receiveSignal 내부 로직에 통합됨
  // signalPeer: (userId, signal) => { ... }

  removePeer: (userId) => {
    get().webRTCManager?.removePeer(userId);
    set(produce(state => {
      state.peers.delete(userId);
    }));
  },

  sendToAllPeers: (message) => {
    return get().webRTCManager?.sendToAllPeers(message) ?? 0;
  },

   replaceTrack: (oldTrack, newTrack, stream) => {
     const { webRTCManager } = get();
     if (webRTCManager) {
       webRTCManager.replaceTrack(oldTrack, newTrack, stream);
     }
   },

  sendFile: (file: File) => {
    const { webRTCManager, peers } = get();
    const { addFileMessage, updateFileProgress } = useChatStore.getState();
    const transferId = `${file.name}-${file.size}-${Date.now()}`;
    const fileMeta = { transferId, name: file.name, size: file.size, type: file.type };

    addFileMessage('local-user', 'You', fileMeta, true);
    const metaMessage = JSON.stringify({ type: 'file-meta', payload: fileMeta });

    const connectedPeerIds = webRTCManager?.getConnectedPeerIds() ?? [];
    
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      let offset = 0;

      const sendChunk = () => {
        if (offset >= buffer.byteLength) return;
        const chunk = buffer.slice(offset, offset + FILE_CHUNK_SIZE);
        const isLast = offset + chunk.byteLength >= buffer.byteLength;
        const chunkMessage = {
          type: 'file-chunk',
          payload: { transferId, chunk: Array.from(new Uint8Array(chunk)), isLast }
        };

        if (connectedPeerIds.length > 0) {
          webRTCManager?.sendToAllPeers(JSON.stringify(chunkMessage));
        } else {
          peers.forEach(peer => {
            useSignalingStore.getState().emit('message', {
              type: 'file-chunk',
              to: peer.userId,
              data: chunkMessage.payload
            });
          });
        }
        
        offset += chunk.byteLength;
        updateFileProgress(transferId, offset);
        
        if (!isLast) {
          setTimeout(sendChunk, 0);
        }
      };

      if (connectedPeerIds.length > 0) {
        webRTCManager?.sendToAllPeers(metaMessage);
      } else {
        peers.forEach(peer => {
          useSignalingStore.getState().emit('message', { type: 'file-meta', to: peer.userId, data: fileMeta });
        });
      }
      
      sendChunk();
    };
  },

  cleanup: () => {
    console.log('[PEER_CONNECTION] 🧹 모든 WebRTC 연결 및 리소스 정리.');
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