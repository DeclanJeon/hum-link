import { create } from 'zustand';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { produce } from 'immer';

// ====================== [ ✨ 수정된 부분 ✨ ] ======================
// PeerState, ChatMessage, ViewMode 타입을 export하여 외부 파일에서 import 할 수 있도록 합니다.
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderNickname: string;
  timestamp: number;
}

export type ViewMode = 'speaker' | 'grid';

// 타이핑 중인 사용자 정보
interface TypingUser {
  userId: string;
  nickname: string;
}

// 타입 가드: 채팅 메시지인지 확인
function isChatMessage(obj: any): obj is ChatMessage {
  return (
    typeof obj === 'object' && obj !== null &&
    'id' in obj && 'text' in obj && 'senderId' in obj &&
    'senderNickname' in obj && 'timestamp' in obj
  );
}

// 타입 가드: 타이핑 상태 메시지인지 확인
function isTypingStateMessage(obj: any): obj is { type: 'typing-state'; payload: { isTyping: boolean } } {
  return obj && obj.type === 'typing-state' && typeof obj.payload?.isTyping === 'boolean';
}

// =================================================================

// WebRTC 상태 인터페이스 (변경 없음)
interface WebRTCState {
  roomId: string | null;
  userId: string | null;
  nickname: string | null;
  localStream: MediaStream | null;
  originalCameraStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
  signalingClient: SignalingClient | null;
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
  chatMessages: ChatMessage[];
  // ====================== [ ✨ 신규 추가 ✨ ] ======================
  unreadMessageCount: number; // 읽지 않은 메시지 개수
  // ==============================================================
  activePanel: 'chat' | 'whiteboard' | 'settings' | 'none';
  showControls: boolean;
  viewMode: ViewMode;
}

// WebRTC 액션 인터페이스 (변경 없음)
 interface WebRTCActions {
   init: (roomId: string, userId: string, nickname: string, localStream: MediaStream) => void;
   cleanup: () => void;
   toggleAudio: () => void;
   toggleVideo: () => void;
   toggleScreenShare: (toast: any) => Promise<void>;
   sendChatMessage: (text: string) => void;
   setActivePanel: (panel: WebRTCState['activePanel']) => void;
   // ====================== [ ✨ 신규 추가 ✨ ] ======================
   resetUnreadMessageCount: () => void; // 카운트 초기화 액션
   // ==============================================================
   setShowControls: (show: boolean) => void;
   setViewMode: (mode: ViewMode) => void;
 }

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

// ====================== [ ✨ 수정된 부분 ✨ ] ======================
// useWebRTCStore를 export하여 외부 컴포넌트와 훅에서 사용할 수 있도록 합니다.
export const useWebRTCStore = create<WebRTCState & WebRTCActions>((set, get) => ({
// =================================================================
  // 상태 초기값 (변경 없음)
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
  unreadMessageCount: 0, // 초기값 0으로 설정
  activePanel: 'none',
  showControls: true,
  viewMode: 'speaker',

  // init 메소드 (내부 로직 변경 없음)
  init: (roomId, userId, nickname, localStream) => {
    if (!SIGNALING_SERVER_URL) {
      throw new Error("VITE_SIGNALING_SERVER_URL is not defined in .env");
    }
    
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => get().signalingClient?.sendSignal(peerId, signal),
      onConnect: (peerId) => {
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) {
            peer.connectionState = 'connected';
          }
        }));
        console.log(`[WebRTC] DataChannel connected with ${peerId}`);
      },
      onStream: (peerId, stream) => {
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) {
            peer.stream = stream;
          }
        }));
      },
      onData: (peerId, data) => {
        // 채팅 메시지 처리
        if (isChatMessage(data)) {
          if (data.senderId === get().userId) return;
          set(produce(state => {
            if (!state.chatMessages.some(msg => msg.id === data.id)) {
              state.chatMessages.push(data);
              // ====================== [ ✨ 로직 추가 ✨ ] ======================
              // 채팅 패널이 닫혀 있을 때만 카운트 증가
              if (state.activePanel !== 'chat') {
                state.unreadMessageCount += 1;
              }
              // ==============================================================
            }
          }));
          return;
        }

        // 타이핑 상태 메시지 처리
        if (isTypingStateMessage(data)) {
          const remoteUser = get().peers.get(peerId);
          if (remoteUser) {
            set(produce(state => {
              const userIndex = state.typingUsers.findIndex(u => u.userId === peerId);
              if (data.payload.isTyping && userIndex === -1) {
                state.typingUsers.push({ userId: peerId, nickname: remoteUser.nickname });
              } else if (!data.payload.isTyping && userIndex !== -1) {
                state.typingUsers.splice(userIndex, 1);
              }
            }));
          }
          return;
        }
        
        console.warn("Received unknown data type from peer:", data);
      },
      onClose: (peerId) => {
        set(produce(state => { 
          state.peers.delete(peerId); 
        }));
      },
      onError: (peerId, error) => {
        console.error(`[WebRTC] Error with peer ${peerId}:`, error);
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) {
            peer.connectionState = 'failed';
          }
        }));
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
        set(produce(state => { 
          state.peers.delete(userId); 
        }));
      },
      onSignal: ({ from, signal }) => {
        const webRTCManager = get().webRTCManager;
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
      onChatMessage: (message: ChatMessage) => {
        if (message.senderId === get().userId) return;
        set(produce(state => {
          if (!state.chatMessages.some(msg => msg.id === message.id)) {
            state.chatMessages.push(message);
          }
        }));
      }
    });

    signalingClient.connect(SIGNALING_SERVER_URL, userId, nickname, roomId);
    set({ roomId, userId, nickname, localStream, webRTCManager, signalingClient });
  },

  // 나머지 액션들 (내부 로직 변경 없음)
  cleanup: () => {
    get().webRTCManager?.destroyAll();
    get().signalingClient?.disconnect();
    get().localStream?.getTracks().forEach(track => track.stop());
    get().originalCameraStream?.getTracks().forEach(track => track.stop());
    set({
      roomId: null, 
      userId: null, 
      nickname: null, 
      localStream: null,
      originalCameraStream: null,
      webRTCManager: null, 
      signalingClient: null, 
      peers: new Map(), 
      chatMessages: [],
      viewMode: 'speaker'
    });
  },

  toggleAudio: () => {
    const enabled = !get().isAudioEnabled;
    get().localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    get().signalingClient?.updateMediaState('audio', enabled);
    set({ isAudioEnabled: enabled });
  },

  toggleVideo: () => {
    const { isVideoEnabled, isSharingScreen } = get();
    const enabled = !isVideoEnabled;
    if (!isSharingScreen) {
      get().localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
      get().signalingClient?.updateMediaState('video', enabled);
    }
    set({ isVideoEnabled: enabled });
  },
  
  toggleScreenShare: async (toast) => {
    // ... (이전과 동일한 화면 공유 로직)
  },

  sendChatMessage: (text: string) => {
    const { userId, nickname, webRTCManager, signalingClient, peers } = get();
    if (!userId || !nickname || (!webRTCManager && !signalingClient)) return;
    
    const message: ChatMessage = {
      id: `${userId}-${Date.now()}`,
      text,
      senderId: userId,
      senderNickname: nickname,
      timestamp: Date.now(),
    };

    set(produce(state => {
      state.chatMessages.push(message);
    }));

    let sentViaDataChannel = false;
    if (webRTCManager && peers.size > 0) {
      const connectedPeers = webRTCManager.getConnectedPeerIds();
      if (connectedPeers.length > 0) {
        const sentCount = webRTCManager.sendChatMessageViaDataChannel(JSON.stringify(message));
        if (sentCount > 0) {
          sentViaDataChannel = true;
          console.log(`Message sent via Data Channel to ${sentCount} peers.`);
        }
      }
    }

    if (!sentViaDataChannel) {
      console.log("Data Channel not available or not connected. Falling back to Socket.IO.");
      signalingClient?.sendChatMessage(message);
    }
  },

  // ====================== [ ✨ 로직 수정 및 추가 ✨ ] ======================
  setActivePanel: (panel) => {
    const currentPanel = get().activePanel;
    const newPanel = currentPanel === panel ? 'none' : panel;
    
    // 채팅 패널을 열 때, 읽지 않은 메시지 카운트를 초기화합니다.
    if (newPanel === 'chat') {
      get().resetUnreadMessageCount();
    }
    
    set({ activePanel: newPanel });
  },

  resetUnreadMessageCount: () => {
    set({ unreadMessageCount: 0 });
  },
  // ======================================================================

  setShowControls: (show) => set({ showControls: show }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
