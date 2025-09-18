import { create } from 'zustand';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { produce } from 'immer';

// Peer 상태 인터페이스
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
  viewMode: ViewMode;
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
  setViewMode: (mode: ViewMode) => void;
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
  viewMode: 'speaker',

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
        console.log(`[WebRTC] Connected to ${peerId}`);
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
        if (isChatMessage(data)) {
          set(produce(state => { 
            state.chatMessages.push(data); 
          }));
        } else {
          console.warn("Received data does not conform to ChatMessage interface:", data);
        }
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
    const {
      isSharingScreen,
      localStream,
      originalCameraStream,
      webRTCManager,
      isAudioEnabled,
      isVideoEnabled,
    } = get();

    if (isSharingScreen) {
      // 화면 공유 중지
      console.log('[ScreenShare] Stopping screen share...');
      
      if (!originalCameraStream) {
        console.error('[ScreenShare] No original stream to restore');
        toast.error("Cannot restore camera - original stream not found");
        return;
      }

      try {
        // 1. 현재 화면 공유 트랙 중지
        const screenTracks = localStream?.getVideoTracks() || [];
        screenTracks.forEach(track => {
          console.log('[ScreenShare] Stopping screen track:', track.label);
          track.stop();
        });

        // 2. 원본 카메라 트랙 확인
        const cameraVideoTrack = originalCameraStream.getVideoTracks()[0];
        if (!cameraVideoTrack) {
          throw new Error('No camera video track available');
        }

        // 트랙이 'ended' 상태인지 확인
        if (cameraVideoTrack.readyState === 'ended') {
          console.error('[ScreenShare] Camera track is ended, recreating stream...');
          
          // 새로운 카메라 스트림 생성
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          
          newStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
          newStream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
          
          // 새 스트림으로 트랙 교체
          const newVideoTrack = newStream.getVideoTracks()[0];
          const success = await webRTCManager?.replaceTrack(newVideoTrack);
          
          if (!success) {
            throw new Error('Failed to replace track with new stream');
          }
          
          set({
            localStream: newStream,
            isSharingScreen: false,
            originalCameraStream: null,
          });
          
          toast.success("Camera reinitialized");
          return;
        }

        // 3. 트랙 enabled 상태 설정
        cameraVideoTrack.enabled = isVideoEnabled;
        console.log('[ScreenShare] Camera track enabled:', isVideoEnabled);

        // 4. 모든 peer connection에 대해 트랙 교체
        const replaceSuccess = await webRTCManager?.replaceTrack(cameraVideoTrack);
        
        if (!replaceSuccess) {
          throw new Error('Failed to replace track in peer connections');
        }

        // 5. 오디오 트랙 상태 복원
        originalCameraStream.getAudioTracks().forEach(track => {
          track.enabled = isAudioEnabled;
        });

        // 6. 로컬 스트림 업데이트
        set({
          localStream: originalCameraStream,
          isSharingScreen: false,
          originalCameraStream: null,
        });

        // 7. 시그널링 서버에 상태 변경 알림
        get().signalingClient?.updateMediaState('video', isVideoEnabled);

        console.log('[ScreenShare] Successfully restored camera');
        toast.info("Camera restored");

      } catch (error) {
        console.error('[ScreenShare] Error restoring camera:', error);
        toast.error("Failed to restore camera properly");
        
        // 에러 시 폴백: 완전히 새로운 스트림 생성
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          
          newStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
          newStream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
          
          await webRTCManager?.updateLocalStream(newStream);
          
          set({
            localStream: newStream,
            isSharingScreen: false,
            originalCameraStream: null,
          });
          
          toast.success("Camera reinitialized");
        } catch (fallbackError) {
          console.error('[ScreenShare] Fallback failed:', fallbackError);
          toast.error("Could not restore camera. Please refresh the page.");
        }
      }

    } else {
      // 화면 공유 시작
      try {
        console.log('[ScreenShare] Starting screen share...');
        
        const screenStream = await navigator.mediaDevices.getDisplayMedia();
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (!screenTrack) {
          throw new Error('No screen track obtained');
        }

        if (!localStream) {
          toast.error("No local stream available");
          screenStream.getTracks().forEach(t => t.stop());
          return;
        }
        
        // 현재 카메라 스트림 저장
        set({ originalCameraStream: localStream });

        // 모든 peer에 대해 트랙 교체
        const success = await webRTCManager?.replaceTrack(screenTrack);
        
        if (!success) {
          throw new Error('Failed to replace track in peer connections');
        }
        
        // 새 로컬 스트림 생성
        const newLocalStream = new MediaStream([
          ...localStream.getAudioTracks(),
          screenTrack
        ]);

        set({
          localStream: newLocalStream,
          isSharingScreen: true
        });

        // 사용자가 화면 공유를 중지할 때
        screenTrack.onended = () => {
          console.log('[ScreenShare] User ended screen share');
          if (get().isSharingScreen) {
            get().toggleScreenShare(toast);
          }
        };

        console.log('[ScreenShare] Screen sharing started successfully');
        toast.success("Screen sharing started");
        
      } catch (err: any) {
        console.error('[ScreenShare] Error:', err);
        
        // 원본 스트림 복원
        const original = get().originalCameraStream;
        if (original) {
          set({
            originalCameraStream: null
          });
        }
        
        if (err.name === 'NotAllowedError') {
          toast.error("Screen sharing permission denied");
        } else {
          toast.error(`Failed to start screen sharing: ${err.message}`);
        }
      }
    }
  },

  sendChatMessage: (text: string) => {
    const { userId, nickname, webRTCManager } = get();
    if (!userId || !nickname) return;
    
    const message: ChatMessage = {
      id: `${userId}-${Date.now()}`,
      text,
      senderId: userId,
      senderNickname: nickname,
      timestamp: Date.now(),
    };
    
    webRTCManager?.sendChatMessage(message);
    set(produce(state => {
      state.chatMessages.push(message);
    }));
  },

  setActivePanel: (panel) => {
    set({ activePanel: get().activePanel === panel ? 'none' : panel });
  },
  
  setShowControls: (show) => set({ showControls: show }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
}));
