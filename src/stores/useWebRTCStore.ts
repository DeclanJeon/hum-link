import { create } from 'zustand';
import { produce } from 'immer';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { useChatStore, ChatMessage } from './useChatStore';
import { useUIManagementStore } from './useUIManagementStore';
import { ENV } from '@/config';

// Peer의 상세 상태를 정의합니다.
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

// 데이터 채널을 통해 전달되는 메시지 타입을 정의합니다.
type DataChannelMessage = 
  | { type: 'chat'; payload: ChatMessage }
  | { type: 'typing-state'; payload: { isTyping: boolean } };

// 타입 가드 함수
function isDataChannelMessage(obj: any): obj is DataChannelMessage {
    return obj && typeof obj.type === 'string' && 'payload' in obj;
}

// WebRTC 핵심 상태
interface WebRTCState {
  roomId: string | null;
  userId: string | null;
  nickname: string | null;
  localStream: MediaStream | null;
  signalingClient: SignalingClient | null;
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
  signalingStatus: 'connecting' | 'connected' | 'disconnected';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
}

// WebRTC 관련 액션
interface WebRTCActions {
  init: (roomId: string, userId: string, nickname: string, localStream: MediaStream) => void;
  cleanup: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  sendChatMessage: (text: string) => void;
}

export const useWebRTCStore = create<WebRTCState & WebRTCActions>((set, get) => ({
  // 초기 상태
  roomId: null,
  userId: null,
  nickname: null,
  localStream: null,
  signalingClient: null,
  webRTCManager: null,
  peers: new Map(),
  signalingStatus: 'connecting',
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,

  // 초기화 함수
  init: (roomId, userId, nickname, localStream) => {
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => get().signalingClient?.sendSignal(peerId, signal),
      onConnect: (peerId) => {
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'connected';
        }));
        console.log(`[WebRTC] DataChannel connected with ${peerId}`);
      },
      onStream: (peerId, stream) => {
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) peer.stream = stream;
        }));
      },
      onData: (peerId, data) => {
        if (!isDataChannelMessage(data)) return;

        if (data.type === 'chat') {
          useChatStore.getState().addMessage(data.payload);
          if (useUIManagementStore.getState().activePanel !== 'chat') {
            useUIManagementStore.getState().incrementUnreadMessageCount();
          }
        } else if (data.type === 'typing-state') {
          const remoteUser = get().peers.get(peerId);
          if (remoteUser) {
            useChatStore.getState().setTypingState(peerId, remoteUser.nickname, data.payload.isTyping);
          }
        }
      },
      onClose: (peerId) => {
        set(produce(state => { state.peers.delete(peerId); }));
      },
      onError: (peerId, error) => {
        console.error(`[WebRTC] Error with peer ${peerId}:`, error);
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'failed';
        }));
      },
    });

    const signalingClient = new SignalingClient({
      onConnect: () => set({ signalingStatus: 'connected' }),
      onDisconnect: () => set({ signalingStatus: 'disconnected' }),
      onRoomUsers: (users) => {
        users.forEach(user => {
          if (user.id !== get().userId) {
            get().webRTCManager?.createPeer(user.id);
            set(produce(state => {
              state.peers.set(user.id, {
                userId: user.id,
                nickname: user.nickname,
                audioEnabled: true,
                videoEnabled: true,
                isSharingScreen: false,
                connectionState: 'connecting',
              });
            }));
          }
        });
      },
      onUserJoined: (user) => {
        set(produce(state => {
          state.peers.set(user.id, {
            userId: user.id,
            nickname: user.nickname,
            audioEnabled: true,
            videoEnabled: true,
            isSharingScreen: false,
            connectionState: 'connecting',
          });
        }));
      },
      onUserLeft: (userId) => {
        get().webRTCManager?.removePeer(userId);
        set(produce(state => { state.peers.delete(userId); }));
      },
      onSignal: ({ from, signal }) => {
        const webRTCManager = get().webRTCManager;
        webRTCManager?.hasPeer(from) ? webRTCManager.signalPeer(from, signal) : webRTCManager?.receiveSignal(from, signal);
      },
      onMediaState: ({ userId, kind, enabled }) => {
        set(produce(state => {
          const peer = state.peers.get(userId);
          if (peer) {
            peer[kind === 'audio' ? 'audioEnabled' : 'videoEnabled'] = enabled;
          }
        }));
      },
      onChatMessage: (message: ChatMessage) => {
        useChatStore.getState().addMessage(message);
        if (useUIManagementStore.getState().activePanel !== 'chat') {
            useUIManagementStore.getState().incrementUnreadMessageCount();
        }
      }
    });

    signalingClient.connect(ENV.VITE_SIGNALING_SERVER_URL, userId, nickname, roomId);
    set({ roomId, userId, nickname, localStream, webRTCManager, signalingClient, isAudioEnabled: localStream.getAudioTracks()[0]?.enabled ?? false, isVideoEnabled: localStream.getVideoTracks()[0]?.enabled ?? false });
  },

  // 정리 함수
  cleanup: () => {
    get().webRTCManager?.destroyAll();
    get().signalingClient?.disconnect();
    get().localStream?.getTracks().forEach(track => track.stop());
    useChatStore.getState().clearChat();
    useUIManagementStore.getState().resetUnreadMessageCount();
    set({
      roomId: null, userId: null, nickname: null, localStream: null,
      webRTCManager: null, signalingClient: null, peers: new Map(),
      signalingStatus: 'disconnected'
    });
  },

  toggleAudio: () => {
    const enabled = !get().isAudioEnabled;
    get().localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    get().signalingClient?.updateMediaState('audio', enabled);
    set({ isAudioEnabled: enabled });
  },

  toggleVideo: () => {
    const enabled = !get().isVideoEnabled;
    if (!get().isSharingScreen) {
      get().localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
      get().signalingClient?.updateMediaState('video', enabled);
    }
    set({ isVideoEnabled: enabled });
  },

  sendChatMessage: (text: string) => {
    const { userId, nickname, webRTCManager, signalingClient } = get();
    if (!userId || !nickname) return;
    
    const message: ChatMessage = {
      id: `${userId}-${Date.now()}`,
      text,
      senderId: userId,
      senderNickname: nickname,
      timestamp: Date.now(),
    };

    // 로컬 상태에 즉시 반영
    useChatStore.getState().addMessage(message);
    
    const dataChannelMessage: DataChannelMessage = { type: 'chat', payload: message };

    // 데이터 채널을 통해 전송 시도
    const sentCount = webRTCManager?.sendToAllPeers(JSON.stringify(dataChannelMessage)) ?? 0;

    // 데이터 채널로 보낼 수 없는 경우 시그널링 서버로 폴백
    if (sentCount === 0) {
      console.log("Data Channel not available. Falling back to Socket.IO.");
      signalingClient?.sendChatMessage(message);
    }
  },
}));
