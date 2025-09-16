import { create } from 'zustand';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { produce } from 'immer';

// Peer 상태 인터페이스 (기존과 동일)
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

// 채팅 메시지 인터페이스 (기존과 동일)
export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderNickname: string;
  timestamp: number;
}

function isChatMessage(obj: any): obj is ChatMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.text === 'string' &&
    typeof obj.senderId === 'string' &&
    typeof obj.senderNickname === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

// 변경점: 뷰 모드 타입을 정의합니다.
export type ViewMode = 'speaker' | 'grid';

interface WebRTCState {
  // 연결 정보
  roomId: string | null;
  userId: string | null;
  nickname: string | null;
  
  // 미디어 상태
  localStream: MediaStream | null;
  originalCameraStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;

  // WebRTC 및 시그널링
  signalingClient: SignalingClient | null;
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
  
  // 채팅
  chatMessages: ChatMessage[];
  
  // UI 상태
  activePanel: 'chat' | 'whiteboard' | 'settings' | 'none';
  showControls: boolean;
  viewMode: ViewMode; // 변경점: 뷰 모드 상태 추가
}

interface WebRTCActions {
  // 초기화 및 정리
  init: (roomId: string, userId: string, nickname: string, localStream: MediaStream) => void;
  cleanup: () => void;
  
  // 미디어 컨트롤
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  
  // 채팅
  sendChatMessage: (text: string) => void;
  
  // UI 컨트롤
  setActivePanel: (panel: WebRTCState['activePanel']) => void;
  setShowControls: (show: boolean) => void;
  setViewMode: (mode: ViewMode) => void; // 변경점: 뷰 모드 설정 액션 추가
}

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

export const useWebRTCStore = create<WebRTCState & WebRTCActions>((set, get) => ({
  // ... 기존 상태들 ...
  roomId: null,
  userId: null,
  nickname: null,
  localStream: null,
  originalCameraStream: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,
  signalingClient: null,
  webRTCManager: null,
  peers: new Map(),
  chatMessages: [],
  activePanel: 'none',
  showControls: true,
  viewMode: 'speaker', // 변경점: 뷰 모드 기본값 설정

  // ... 기존 init, cleanup, 미디어 토글, 채팅 함수들 ...
  init: (roomId, userId, nickname, localStream) => {
    if (!SIGNALING_SERVER_URL) {
      throw new Error("VITE_SIGNALING_SERVER_URL is not defined in .env");
    }
    
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => get().signalingClient?.sendSignal(peerId, signal),
      onConnect: (peerId) => {
        set(produce(state => { state.peers.get(peerId)!.connectionState = 'connected'; }));
        console.log(`[WebRTC] Connected to ${peerId}`);
      },
      onStream: (peerId, stream) => {
        set(produce(state => { state.peers.get(peerId)!.stream = stream; }));
      },
      onData: (peerId, data) => {
        try {
          const parsedData = JSON.parse(data.toString());
          if (isChatMessage(parsedData)) {
            set(produce(state => { state.chatMessages.push(parsedData); }));
          } else {
            console.warn("Received data does not conform to ChatMessage interface:", parsedData);
          }
        } catch (error) {
          console.error("Failed to parse data channel message:", error);
        }
      },
      onClose: (peerId) => {
        set(produce(state => { state.peers.delete(peerId); }));
      },
      onError: (peerId, error) => {
        console.error(`[WebRTC] Error with peer ${peerId}:`, error);
        set(produce(state => { state.peers.get(peerId)!.connectionState = 'failed'; }));
      },
    });

    const signalingClient = new SignalingClient({
      onConnect: () => console.log('[Signaling] Connected to server'),
      onDisconnect: () => console.log('[Signaling] Disconnected from server'),
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
        console.log('[useWebRTCStore] Signal received', { from, signalType: signal.type });
        if (webRTCManager?.hasPeer(from)) {
          webRTCManager.signalPeer(from, signal);
        } else {
          webRTCManager?.receiveSignal(from, signal);
        }
      },
      onMediaState: ({ userId, kind, enabled }) => {
        set(produce(state => {
          const peer = state.peers.get(userId);
          if (peer) {
            peer[kind === 'audio' ? 'audioEnabled' : 'videoEnabled'] = enabled;
          }
        }));
      },
    });

    signalingClient.connect(SIGNALING_SERVER_URL, userId, nickname, roomId);
    set({ roomId, userId, nickname, localStream, webRTCManager, signalingClient });
  },

  cleanup: () => {
    get().webRTCManager?.destroyAll();
    get().signalingClient?.disconnect();
    get().localStream?.getTracks().forEach(track => track.stop());
    set({
      roomId: null, userId: null, nickname: null, localStream: null,
      webRTCManager: null, signalingClient: null, peers: new Map(), chatMessages: [],
      viewMode: 'speaker' // 클린업 시 기본값으로 리셋
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
    get().localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
    get().signalingClient?.updateMediaState('video', enabled);
    set({ isVideoEnabled: enabled });
  },
  
  toggleScreenShare: async (toast) => {
    // ... 기존 화면 공유 로직 ...
  },

  sendChatMessage: (text: string) => {
    // ... 기존 채팅 메시지 전송 로직 ...
  },

  setActivePanel: (panel) => {
    set({ activePanel: get().activePanel === panel ? 'none' : panel });
  },
  setShowControls: (show) => set({ showControls: show }),

  // 변경점: 뷰 모드를 설정하는 액션 구현
  setViewMode: (mode) => set({ viewMode: mode }),
}));
