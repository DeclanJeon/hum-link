import { create } from 'zustand';
import { usePeerConnectionStore } from './usePeerConnectionStore';
import { useSignalingStore } from './useSignalingStore';
import { cameraManager, CameraFacing } from '@/lib/cameraStrategy';
import { toast } from 'sonner';

interface MediaDeviceState {
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
  originalVideoTrack: MediaStreamTrack | null;
  preShareVideoState: boolean | null;
  // 모바일 카메라 관련 추가
  isMobile: boolean;
  cameraFacing: CameraFacing;
  hasMultipleCameras: boolean;
}

interface MediaDeviceActions {
  setLocalStream: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  // 모바일 카메라 관련 추가
  initializeMobileDetection: () => Promise<void>;
  switchCamera: () => Promise<void>;
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

  setLocalStream: (stream) => {
    set({
      localStream: stream,
      isAudioEnabled: stream.getAudioTracks()[0]?.enabled ?? false,
      isVideoEnabled: stream.getVideoTracks()[0]?.enabled ?? false,
    });
    
    // 스트림 설정 시 모바일 감지도 실행
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
  const { localStream, isMobile, hasMultipleCameras, isVideoEnabled, isSharingScreen } = get();
  
  if (!isMobile || !hasMultipleCameras) {
    return;
  }
  
  if (isSharingScreen) {
    toast.warning('Cannot switch camera while screen sharing');
    return;
  }
  
  if (!localStream) {
    toast.error('No active stream');
    return;
  }
  
  try {
    // 현재 비디오 트랙 상태 저장
    const currentVideoTrack = localStream.getVideoTracks()[0];
    const wasEnabled = currentVideoTrack?.enabled || false;
    
    // 카메라 전환
    const newStream = await cameraManager.switchCamera(localStream);
    
    if (newStream && newStream !== localStream) {
      const oldVideoTrack = localStream.getVideoTracks()[0];
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      if (oldVideoTrack && newVideoTrack) {
        // WebRTC 피어에 트랙 교체
        const { webRTCManager } = usePeerConnectionStore.getState();
        if (webRTCManager) {
          webRTCManager.replaceTrack(oldVideoTrack, newVideoTrack, newStream);
        }
        
        // 로컬 스트림 업데이트
        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(newVideoTrack);
        oldVideoTrack.stop();
        
        // 이전 상태 복원
        newVideoTrack.enabled = wasEnabled;
        
        set({
          localStream: newStream,
          cameraFacing: cameraManager.getCurrentFacing()
        });
        
        // 시각적 피드백
        toast.success(`Camera switched`, {
          duration: 1000,
          position: 'top-center'
        });
      }
    }
  } catch (error) {
    console.error('[MediaDevice] Camera switch failed:', error);
    toast.error('Failed to switch camera');
  }
},

  toggleAudio: () => {
    const enabled = !get().isAudioEnabled;
    get().localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    useSignalingStore.getState().updateMediaState({ kind: 'audio', enabled });
    set({ isAudioEnabled: enabled });
  },

  toggleVideo: () => {
    const { isVideoEnabled, isSharingScreen, localStream } = get();
    const enabled = !isVideoEnabled;
    if (!isSharingScreen) {
      localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
      useSignalingStore.getState().updateMediaState({ kind: 'video', enabled });
    }
    set({ isVideoEnabled: enabled });
  },

  toggleScreenShare: async (toast: any) => {
    const { isSharingScreen, localStream, originalVideoTrack, isVideoEnabled, preShareVideoState } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();

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
      hasMultipleCameras: false
    });
  },
}));