/**
 * @fileoverview WebRTC 피어 연결 상태 관리 (수정)
 * @module stores/usePeerConnectionStore
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';
import { useSessionStore } from './useSessionStore';

export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  transcript?: { text: string; isFinal: boolean; lang: string };
  isStreamingFile?: boolean;
}

interface PeerConnectionEvents {
  onData: (peerId: string, data: any) => void;
}

interface PeerConnectionState {
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
}

interface PeerConnectionActions {
  initialize: (localStream: MediaStream, events: PeerConnectionEvents) => void;
  createPeer: (userId: string, nickname: string, initiator: boolean) => void;
  updateIceServers: (servers: RTCIceServer[]) => void;
  receiveSignal: (from: string, nickname: string, signal: SignalData) => void;
  removePeer: (userId: string) => void;
  sendToAllPeers: (message: any) => { successful: string[], failed: string[] };
  sendToPeer: (peerId: string, message: any) => boolean;
  cleanup: () => void;
  updatePeerMediaState: (userId: string, kind: 'audio' | 'video', enabled: boolean) => void;
  updatePeerStreamingState: (userId: string, isStreaming: boolean) => void;
}

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  peers: new Map(),

  /**
   * 초기화
   */
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
        console.error(`[PeerConnection] Error on peer ${peerId}:`, error);
        set(produce(state => {
          if (state.peers.has(peerId)) {
            state.peers.get(peerId)!.connectionState = 'failed';
          }
        }));
      }
    });

    set({ webRTCManager });
  },

  /**
   * 피어 생성
   */
  createPeer: (userId, nickname, initiator) => {
    get().webRTCManager?.createPeer(userId, initiator);
    set(produce(state => {
      state.peers.set(userId, {
        userId,
        nickname,
        audioEnabled: true,
        videoEnabled: true,
        isSharingScreen: false,
        connectionState: 'connecting',
        isStreamingFile: false
      });
    }));
  },

  /**
   * ICE 서버 업데이트
   */
  updateIceServers: (servers) => {
    get().webRTCManager?.updateIceServers(servers);
  },

  /**
   * 시그널 수신
   */
  receiveSignal: (from, nickname, signal) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) return;
    
    if (peers.has(from)) {
      webRTCManager.receiveSignal(from, signal);
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
          connectionState: 'connecting',
          isStreamingFile: false
        });
      }));
    }
  },

  /**
   * 피어 제거
   */
  removePeer: (userId) => {
    get().webRTCManager?.removePeer(userId);
    set(produce(state => {
      state.peers.delete(userId);
    }));
  },

  /**
   * 모든 피어에게 메시지 전송
   */
  sendToAllPeers: (message) => {
    return get().webRTCManager?.sendToAllPeers(message) ?? { successful: [], failed: [] };
  },

  /**
   * 특정 피어에게 메시지 전송
   */
  sendToPeer: (peerId, message) => {
    return get().webRTCManager?.sendToPeer(peerId, message) ?? false;
  },

  /**
   * 정리
   */
  cleanup: () => {
    get().webRTCManager?.destroyAll();
    set({ 
      webRTCManager: null, 
      peers: new Map() 
    });
  },

  /**
   * 피어 미디어 상태 업데이트
   */
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
  },

  /**
   * 피어 스트리밍 상태 업데이트
   */
  updatePeerStreamingState: (userId, isStreaming) => {
    set(produce(state => {
      const peer = state.peers.get(userId);
      if (peer) {
        peer.isStreamingFile = isStreaming;
      }
    }));
  }
}));
