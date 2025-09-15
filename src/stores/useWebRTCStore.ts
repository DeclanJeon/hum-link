import { create } from 'zustand';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { produce } from 'immer';

// Peer의 미디어 및 연결 상태를 나타내는 인터페이스
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

// 채팅 메시지 인터페이스
export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderNickname: string;
  timestamp: number;
}

// ChatMessage 타입 가드
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

interface WebRTCState {
  // 기본 정보
  roomId: string | null;
  userId: string | null;
  nickname: string | null;
  
  // 미디어 및 스트림
  localStream: MediaStream | null;
  originalCameraStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;

  // 연결 및 Peer 상태
  signalingClient: SignalingClient | null;
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
  
  // 채팅
  chatMessages: ChatMessage[];
  
  // UI 상태
  activePanel: 'chat' | 'whiteboard' | 'settings' | 'none';
  showControls: boolean;
}

interface WebRTCActions {
  // 초기화 및 종료
  init: (roomId: string, userId: string, nickname: string, localStream: MediaStream) => void;
  cleanup: () => void;
  
  // 미디어 제어
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  
  // 채팅
  sendChatMessage: (text: string) => void;
  
  // UI 제어
  setActivePanel: (panel: WebRTCState['activePanel']) => void;
  setShowControls: (show: boolean) => void;
}

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

export const useWebRTCStore = create<WebRTCState & WebRTCActions>((set, get) => ({
  // 초기 상태
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

  // 액션 구현
  init: (roomId, userId, nickname, localStream) => {
    if (!SIGNALING_SERVER_URL) {
      throw new Error("VITE_SIGNALING_SERVER_URL 환경 변수가 설정되지 않았습니다.");
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
      webRTCManager: null, signalingClient: null, peers: new Map(), chatMessages: []
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
    if (get().isSharingScreen) {
        // 화면 공유 중지 로직 (원래 카메라 스트림으로 복원)
        const originalStream = get().originalCameraStream;
        if (originalStream) {
            get().webRTCManager?.replaceTrack(originalStream);
        }
        toast.info("Screen sharing stopped.");
        set({ isSharingScreen: false, originalCameraStream: null });
    } else {
        try {
            // 현재 카메라 스트림을 저장
            const currentStream = get().localStream;
            if (!currentStream) {
                toast.error("No local stream available.");
                return;
            }
            set({ originalCameraStream: currentStream });

            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            
            // 사용자가 브라우저 UI로 공유를 중지한 경우 자동 복원
            screenStream.getVideoTracks()[0].onended = () => {
                if (get().originalCameraStream) {
                    get().webRTCManager?.replaceTrack(get().originalCameraStream);
                    set({ isSharingScreen: false, originalCameraStream: null });
                    toast.info("Screen sharing stopped by user.");
                }
            };

            get().webRTCManager?.replaceTrack(screenStream);
            set({ isSharingScreen: true });
            toast.success("Screen sharing started.");
        } catch (err) {
            // 에러 발생 시 저장한 카메라 스트림 상태도 초기화
            set({ originalCameraStream: null });
            toast.error("Could not start screen sharing.");
            console.error("Screen share error:", err);
        }
    }
  },

  sendChatMessage: (text: string) => {
    const { userId, nickname } = get();
    if (!text.trim() || !userId || !nickname) return;
    const message: ChatMessage = {
      id: `${userId}-${Date.now()}`,
      text: text.trim(),
      senderId: userId,
      senderNickname: nickname,
      timestamp: Date.now(),
    };
    get().webRTCManager?.sendChatMessage(message);
    // 보낸 메시지를 바로 UI에 표시
    set(produce(state => { state.chatMessages.push(message); }));
  },

  setActivePanel: (panel) => {
    set({ activePanel: get().activePanel === panel ? 'none' : panel });
  },
  setShowControls: (show) => set({ showControls: show }),
}));
