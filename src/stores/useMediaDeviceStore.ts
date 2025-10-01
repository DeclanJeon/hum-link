import { create } from 'zustand';
import { usePeerConnectionStore } from './usePeerConnectionStore';
import { useSignalingStore } from './useSignalingStore';
import { useLobbyStore } from './useLobbyStore';
import { cameraManager, CameraFacing } from '@/lib/cameraStrategy';
import { toast } from 'sonner';

interface OriginalMediaState {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  audioTrackEnabled: boolean;
  videoTrackEnabled: boolean;
  isSharingScreen: boolean;
  streamType: 'camera' | 'screen' | 'none';
  savedAt: number;
}

interface MediaDeviceState {
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
  originalVideoTrack: MediaStreamTrack | null;
  preShareVideoState: boolean | null;
  // 모바일 관련
  isMobile: boolean;
  cameraFacing: CameraFacing;
  hasMultipleCameras: boolean;
  // 파일 스트리밍 관련 추가
  isFileStreaming: boolean;
  originalMediaState: OriginalMediaState | null;
}

interface MediaDeviceActions {
  setLocalStream: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  // 모바일 관련
  initializeMobileDetection: () => Promise<void>;
  switchCamera: () => Promise<void>;
  // 파일 스트리밍 관련 추가
  saveOriginalMediaState: () => void;
  restoreOriginalMediaState: () => Promise<boolean>;
  setFileStreaming: (streaming: boolean) => void;
  cleanup: () => void;
}

export const useMediaDeviceStore = create<MediaDeviceState & MediaDeviceActions>((set, get) => ({
  localStream: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,
  originalVideoTrack: null,
  preShareVideoState: null,
  isMobile: false,
  cameraFacing: 'user',
  hasMultipleCameras: false,
  isFileStreaming: false,
  originalMediaState: null,

  setLocalStream: (stream) => {
    set({
      localStream: stream,
      isAudioEnabled: stream.getAudioTracks()[0]?.enabled ?? false,
      isVideoEnabled: stream.getVideoTracks()[0]?.enabled ?? false,
    });
    
    // 모바일 감지 초기화
    get().initializeMobileDetection();
  },

  initializeMobileDetection: async () => {
    const isMobile = cameraManager.isMobileDevice();
    const cameras = await cameraManager.detectCameras();
    const hasMultipleCameras = cameras.length > 1;
    
    set({
      isMobile,
      hasMultipleCameras,
      cameraFacing: cameraManager.getCurrentFacing()
    });
    
    console.log(`[MediaDevice] Mobile: ${isMobile}, Cameras: ${cameras.length}`);
  },

  switchCamera: async () => {
    const {
      localStream,
      isMobile,
      hasMultipleCameras,
      isVideoEnabled,
      isSharingScreen,
      isFileStreaming
    } = get();
    
    // 검증 로직
    if (!isMobile || !hasMultipleCameras) {
      toast.warning('카메라 전환은 모바일에서만 가능합니다');
      return;
    }
    
    if (isSharingScreen || isFileStreaming) {
      toast.warning('화면 공유 또는 파일 스트리밍 중에는 카메라를 전환할 수 없습니다');
      return;
    }
    
    if (!localStream) {
      toast.error('활성 스트림이 없습니다');
      return;
    }
    
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (!currentVideoTrack) {
        toast.error('비디오 트랙을 찾을 수 없습니다');
        return;
      }
      
      const wasEnabled = currentVideoTrack.enabled;
      const currentFacing = cameraManager.getCurrentFacing();
      const targetFacing: CameraFacing = currentFacing === 'user' ? 'environment' : 'user';
      
      console.log(`[MediaDevice] Switching: ${currentFacing} → ${targetFacing}`);
      
      // 🔑 핵심: getUserMedia로 새 스트림 획득 (iOS 호환)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: targetFacing }, // exact 대신 ideal 사용
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      
      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error: any) {
        // Fallback: deviceId로 직접 선택
        console.warn('[MediaDevice] facingMode failed, trying deviceId approach');
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        
        // 현재 카메라가 아닌 다른 카메라 선택
        const currentDeviceId = currentVideoTrack.getSettings().deviceId;
        const nextCamera = cameras.find(cam => cam.deviceId !== currentDeviceId);
        
        if (!nextCamera) {
          throw new Error('다른 카메라를 찾을 수 없습니다');
        }
        
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextCamera.deviceId } },
          audio: false
        });
      }
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새 비디오 트랙을 생성하지 못했습니다');
      }
      
      // 오디오 트랙 복사 (있을 경우)
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        newStream.addTrack(audioTrack.clone());
      }
      
      // 🔑 WebRTC 연결에 트랙 교체 (비동기 처리)
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] Replacing track in peer connections...');
        
        // replaceTrack은 renegotiation 없이 트랙만 교체
        await webRTCManager.replaceTrack(currentVideoTrack, newVideoTrack, newStream);
        
        console.log('[MediaDevice] Track replacement successful');
      }
      
      // 로컬 스트림 업데이트
      localStream.removeTrack(currentVideoTrack);
      localStream.addTrack(newVideoTrack);
      
      // 🔑 이전 트랙 정리 (약간의 지연 후)
      setTimeout(() => {
        currentVideoTrack.stop();
      }, 100);
      
      // enabled 상태 복원
      newVideoTrack.enabled = wasEnabled;
      
      // Store 업데이트
      set({
        localStream: newStream,
        cameraFacing: targetFacing,
        isVideoEnabled: wasEnabled
      });
      
      // Lobby 스트림 동기화
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream === localStream) {
        useLobbyStore.setState({ stream: newStream });
      }
      
      // 시그널링 상태 업데이트
      useSignalingStore.getState().updateMediaState({
        kind: 'video',
        enabled: wasEnabled
      });
      
      // CameraManager 상태 업데이트
      // cameraManager.setCurrentFacing(targetFacing); // CameraManager에 setCurrentFacing 메서드가 없으므로 제거
      
      toast.success(`${targetFacing === 'user' ? '전면' : '후면'} 카메라로 전환됨`, {
        duration: 1500,
        position: 'top-center'
      });
      
    } catch (error) {
      console.error('[MediaDevice] Camera switch failed:', error);
      toast.error('카메라 전환 실패');
      
      // 롤백: 원래 스트림 복원
      try {
        const { webRTCManager } = usePeerConnectionStore.getState();
        if (webRTCManager && localStream) {
          const track = localStream.getVideoTracks()[0];
          if (track) {
            webRTCManager.updateLocalStream(localStream);
          }
        }
      } catch (rollbackError) {
        console.error('[MediaDevice] Rollback failed:', rollbackError);
      }
    }
  },

  toggleAudio: () => {
    const { isFileStreaming, isAudioEnabled, localStream } = get();
    
    if (isFileStreaming) {
      toast.warning('Cannot toggle audio during file streaming');
      return;
    }
    
    const enabled = !isAudioEnabled;
    localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    useSignalingStore.getState().updateMediaState({ kind: 'audio', enabled });
    set({ isAudioEnabled: enabled });
  },

  toggleVideo: () => {
    const { isVideoEnabled, isSharingScreen, localStream, isFileStreaming } = get();
    
    if (isFileStreaming) {
      toast.warning('Cannot toggle video during file streaming');
      return;
    }
    
    const enabled = !isVideoEnabled;
    if (!isSharingScreen) {
      localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
      useSignalingStore.getState().updateMediaState({ kind: 'video', enabled });
    }
    set({ isVideoEnabled: enabled });
  },

  toggleScreenShare: async (toast: any) => {
    const { isSharingScreen, localStream, originalVideoTrack, isVideoEnabled, preShareVideoState, isFileStreaming } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();

    if (isFileStreaming) {
      toast.warning('Cannot share screen during file streaming');
      return;
    }

    if (!webRTCManager) {
      toast.error('WebRTC not initialized');
      return;
    }

    if (isSharingScreen) {
      if (originalVideoTrack && localStream) {
        const screenTrack = localStream.getVideoTracks()[0];
        webRTCManager.replaceTrack(screenTrack, originalVideoTrack, localStream);
        localStream.removeTrack(screenTrack);
        localStream.addTrack(originalVideoTrack);
        screenTrack.stop();

        const wasVideoEnabledBeforeShare = preShareVideoState ?? false;
        originalVideoTrack.enabled = wasVideoEnabledBeforeShare;

        set({
          isSharingScreen: false,
          originalVideoTrack: null,
          isVideoEnabled: wasVideoEnabledBeforeShare,
          preShareVideoState: null,
        });
        
        useSignalingStore.getState().updateMediaState({ kind: 'video', enabled: wasVideoEnabledBeforeShare });
        toast.info("Screen sharing has ended.");
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (localStream) {
          const currentVideoTrack = localStream.getVideoTracks()[0];
          set({
            originalVideoTrack: currentVideoTrack,
            preShareVideoState: isVideoEnabled
          });

          webRTCManager.replaceTrack(currentVideoTrack, screenTrack, localStream);
          localStream.removeTrack(currentVideoTrack);
          localStream.addTrack(screenTrack);
          
          set({ isSharingScreen: true, isVideoEnabled: true });
          useSignalingStore.getState().updateMediaState({ kind: 'video', enabled: true });
          
          screenTrack.onended = () => {
            if (get().isSharingScreen) {
              get().toggleScreenShare(toast);
            }
          };
          toast.success("Started screen sharing.");
        }
      } catch (error) {
        console.error("Screen share error:", error);
        toast.error("Could not start screen sharing. Permission may have been denied.");
      }
    }
  },

  saveOriginalMediaState: () => {
    const { localStream, isAudioEnabled, isVideoEnabled, isSharingScreen } = get();
    
    if (!localStream) {
      console.warn('[MediaDevice] No stream to save state from');
      return;
    }
    
    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];
    
    const state: OriginalMediaState = {
      isAudioEnabled,
      isVideoEnabled,
      audioTrack: audioTrack || null,
      videoTrack: videoTrack || null,
      audioTrackEnabled: audioTrack?.enabled || false,
      videoTrackEnabled: videoTrack?.enabled || false,
      isSharingScreen,
      streamType: isSharingScreen ? 'screen' : (videoTrack ? 'camera' : 'none'),
      savedAt: Date.now()
    };
    
    set({ originalMediaState: state });
    
    console.log('[MediaDevice] Saved original media state:', {
      isAudioEnabled: state.isAudioEnabled,
      isVideoEnabled: state.isVideoEnabled,
      audioTrackEnabled: state.audioTrackEnabled,
      videoTrackEnabled: state.videoTrackEnabled,
      isSharingScreen: state.isSharingScreen,
      streamType: state.streamType
    });
  },

  restoreOriginalMediaState: async () => {
    const { originalMediaState, localStream } = get();
    
    if (!originalMediaState || !localStream) {
      console.error('[MediaDevice] Cannot restore: no saved state or stream');
      return false;
    }
    
    console.log('[MediaDevice] Restoring original media state...');
    
    try {
      // 1. 오디오 트랙 복원
      const currentAudioTrack = localStream.getAudioTracks()[0];
      if (originalMediaState.audioTrack && currentAudioTrack) {
        // 트랙의 enabled 상태 복원
        currentAudioTrack.enabled = originalMediaState.audioTrackEnabled;
      }
      
      // 2. 비디오 트랙 복원
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (originalMediaState.videoTrack && currentVideoTrack) {
        // 트랙의 enabled 상태 복원
        currentVideoTrack.enabled = originalMediaState.videoTrackEnabled;
      }
      
      // 3. 스토어 상태 복원
      set({
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        isSharingScreen: originalMediaState.isSharingScreen,
        originalMediaState: null, // 복원 후 클리어
        isFileStreaming: false
      });
      
      // 4. 시그널링 서버에 상태 알림
      const { updateMediaState } = useSignalingStore.getState();
      updateMediaState({ kind: 'audio', enabled: originalMediaState.isAudioEnabled });
      updateMediaState({ kind: 'video', enabled: originalMediaState.isVideoEnabled });
      
      console.log('[MediaDevice] Media state restored successfully:', {
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        audioTrackEnabled: originalMediaState.audioTrackEnabled,
        videoTrackEnabled: originalMediaState.videoTrackEnabled
      });
      
      return true;
    } catch (error) {
      console.error('[MediaDevice] Failed to restore media state:', error);
      set({ originalMediaState: null, isFileStreaming: false });
      return false;
    }
  },

  setFileStreaming: (streaming: boolean) => {
    set({ isFileStreaming: streaming });
    console.log(`[MediaDevice] File streaming state: ${streaming}`);
  },

  cleanup: () => {
    get().localStream?.getTracks().forEach(track => track.stop());
    get().originalVideoTrack?.stop();
    set({
      localStream: null,
      originalVideoTrack: null,
      isSharingScreen: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      preShareVideoState: null,
      isMobile: false,
      cameraFacing: 'user',
      hasMultipleCameras: false,
      isFileStreaming: false,
      originalMediaState: null
    });
  },
}));
