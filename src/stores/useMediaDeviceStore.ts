// frontend/src/stores/useMediaDeviceStore.ts
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
  // 모바일 카메라
  isMobile: boolean;
  cameraFacing: CameraFacing;
  hasMultipleCameras: boolean;
  // 파일 스트리밍 상태
  isFileStreaming: boolean;
  originalMediaState: OriginalMediaState | null;
  // 카메라 전환 중 플래그
  isSwitchingCamera: boolean;
}

interface MediaDeviceActions {
  setLocalStream: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  // 모바일 카메라
  initializeMobileDetection: () => Promise<void>;
  switchCamera: () => Promise<void>;
  // 파일 스트리밍 복구
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
  isSwitchingCamera: false,

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
    
    console.log(`[MediaDevice] 모바일: ${isMobile}, 카메라 수: ${cameras.length}`);
  },

  /**
   * 🔄 완전히 개선된 카메라 전환 로직
   */
  switchCamera: async () => {
    const {
      localStream,
      isMobile,
      hasMultipleCameras,
      isVideoEnabled,
      isSharingScreen,
      isFileStreaming,
      isSwitchingCamera
    } = get();
    
    // 🔒 1. 사전 검증
    if (isSwitchingCamera) {
      console.log('[MediaDevice] 카메라 전환이 이미 진행 중입니다');
      return;
    }
    
    if (!isMobile || !hasMultipleCameras) {
      toast.warning('카메라 전환은 모바일에서만 가능합니다');
      return;
    }
    
    if (isSharingScreen || isFileStreaming) {
      toast.warning('화면 공유 또는 파일 스트리밍 중에는 카메라를 전환할 수 없습니다');
      return;
    }
    
    if (!localStream) {
      toast.error('스트림이 없습니다');
      return;
    }
    
    // 전환 중 플래그 설정
    set({ isSwitchingCamera: true });
    
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (!currentVideoTrack) {
        throw new Error('비디오 트랙이 없습니다');
      }
      
      const wasEnabled = currentVideoTrack.enabled;
      const currentFacing = cameraManager.getCurrentFacing();
      const targetFacing: CameraFacing = currentFacing === 'user' ? 'environment' : 'user';
      
      console.log(`[MediaDevice] 카메라 전환 시작: ${currentFacing} → ${targetFacing}`);
      console.log(`[MediaDevice] 현재 트랙 상태: enabled=${wasEnabled}, readyState=${currentVideoTrack.readyState}`);
      
      // 📹 2. 새 카메라 스트림 획득
      let newStream: MediaStream;
      try {
        console.log('[MediaDevice] facingMode 방식으로 스트림 요청 중...');
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (error: any) {
        console.warn('[MediaDevice] facingMode 실패, deviceId 방식으로 재시도:', error.message);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        const currentDeviceId = currentVideoTrack.getSettings().deviceId;
        const nextCamera = cameras.find(cam => cam.deviceId !== currentDeviceId);
        
        if (!nextCamera) {
          throw new Error('다른 카메라를 찾을 수 없습니다');
        }
        
        console.log(`[MediaDevice] 다음 카메라로 전환: ${nextCamera.label}`);
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextCamera.deviceId } },
          audio: false
        });
      }
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새 비디오 트랙을 가져올 수 없습니다');
      }
      
      console.log(`[MediaDevice] 새 트랙 획득 성공: ${newVideoTrack.label}`);
      
      // 🔄 3. 오디오 트랙 복제 (기존 오디오 유지)
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        console.log('[MediaDevice] 기존 오디오 트랙 복제 중...');
        newStream.addTrack(audioTrack);
      }
      
      // 🌐 4. WebRTC Peer Connection 업데이트
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTC 트랙 교체 시작...');
        
        // ⚠️ 핵심: replaceTrack이 완료될 때까지 대기
        await webRTCManager.replaceTrack(currentVideoTrack, newVideoTrack, newStream);
        
        console.log('[MediaDevice] WebRTC 트랙 교체 완료');
      }
      
      // 📺 5. 로컬 스트림 업데이트 (새 객체로 완전 교체)
      console.log('[MediaDevice] 로컬 스트림 업데이트 중...');
      set({
        localStream: newStream,
        cameraFacing: targetFacing,
        isVideoEnabled: wasEnabled
      });
      
      // 🎥 6. Lobby Store 동기화
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        console.log('[MediaDevice] Lobby Store 동기화 중...');
        useLobbyStore.setState({ stream: newStream });
      }
      
      // 📡 7. Signaling 서버에 상태 알림
      useSignalingStore.getState().updateMediaState({
        kind: 'video',
        enabled: wasEnabled
      });
      
      // ✅ 8. 새 트랙 활성화 상태 설정
      newVideoTrack.enabled = wasEnabled;
      console.log(`[MediaDevice] 새 트랙 활성화 상태 설정: ${wasEnabled}`);
      
      // 🗑️ 9. 기존 트랙 정리 (충분한 지연 후)
      // ⚠️ 핵심: 500ms 지연으로 Peer Connection이 안정화될 시간 확보
      setTimeout(() => {
        if (currentVideoTrack.readyState !== 'ended') {
          currentVideoTrack.stop();
          console.log('[MediaDevice] 이전 비디오 트랙 정리 완료');
        }
      }, 500);
      
      // 🎉 성공 메시지
      toast.success(
        `${targetFacing === 'user' ? '전면' : '후면'} 카메라로 전환됨`,
        { duration: 1500, position: 'top-center' }
      );
      
      console.log('[MediaDevice] 카메라 전환 완료 ✅');
      
    } catch (error: any) {
      console.error('[MediaDevice] 카메라 전환 실패:', error);
      toast.error(`카메라 전환 실패: ${error.message}`);
      
      // 🔄 롤백 시도
      try {
        console.log('[MediaDevice] 롤백 시도 중...');
        const { webRTCManager } = usePeerConnectionStore.getState();
        if (webRTCManager && localStream) {
          const track = localStream.getVideoTracks()[0];
          if (track && track.readyState === 'live') {
            webRTCManager.updateLocalStream(localStream);
            console.log('[MediaDevice] 롤백 성공');
          }
        }
      } catch (rollbackError) {
        console.error('[MediaDevice] 롤백 실패:', rollbackError);
      }
    } finally {
      // 전환 중 플래그 해제
      set({ isSwitchingCamera: false });
    }
  },

  toggleAudio: () => {
    const { isFileStreaming, isAudioEnabled, localStream } = get();
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 오디오를 토글할 수 없습니다');
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
      toast.warning('파일 스트리밍 중에는 비디오를 토글할 수 없습니다');
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
      toast.warning('파일 스트리밍 중에는 화면 공유를 할 수 없습니다');
      return;
    }

    if (!webRTCManager) {
      toast.error('WebRTC가 초기화되지 않았습니다');
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
        toast.info("화면 공유가 종료되었습니다.");
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
          toast.success("화면 공유를 시작했습니다.");
        }
      } catch (error) {
        console.error("화면 공유 오류:", error);
        toast.error("화면 공유를 시작할 수 없습니다. 권한이 거부되었을 수 있습니다.");
      }
    }
  },

  saveOriginalMediaState: () => {
    const { localStream, isAudioEnabled, isVideoEnabled, isSharingScreen } = get();
    
    if (!localStream) {
      console.warn('[MediaDevice] 저장할 스트림이 없습니다');
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
    
    console.log('[MediaDevice] 원본 미디어 상태 저장:', {
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
      console.error('[MediaDevice] 복원할 상태나 스트림이 없습니다');
      return false;
    }
    
    console.log('[MediaDevice] 원본 미디어 상태 복원 중...');
    
    try {
      // 1. 오디오 트랙 복원
      const currentAudioTrack = localStream.getAudioTracks()[0];
      if (originalMediaState.audioTrack && currentAudioTrack) {
        currentAudioTrack.enabled = originalMediaState.audioTrackEnabled;
      }
      
      // 2. 비디오 트랙 복원
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (originalMediaState.videoTrack && currentVideoTrack) {
        currentVideoTrack.enabled = originalMediaState.videoTrackEnabled;
      }
      
      // 3. 상태 업데이트
      set({
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        isSharingScreen: originalMediaState.isSharingScreen,
        originalMediaState: null,
        isFileStreaming: false
      });
      
      // 4. 시그널링 서버 동기화
      const { updateMediaState } = useSignalingStore.getState();
      updateMediaState({ kind: 'audio', enabled: originalMediaState.isAudioEnabled });
      updateMediaState({ kind: 'video', enabled: originalMediaState.isVideoEnabled });
      
      console.log('[MediaDevice] 미디어 상태 복원 성공:', {
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        audioTrackEnabled: originalMediaState.audioTrackEnabled,
        videoTrackEnabled: originalMediaState.videoTrackEnabled
      });
      
      return true;
    } catch (error) {
      console.error('[MediaDevice] 미디어 상태 복원 실패:', error);
      set({ originalMediaState: null, isFileStreaming: false });
      return false;
    }
  },

  setFileStreaming: (streaming: boolean) => {
    set({ isFileStreaming: streaming });
    console.log(`[MediaDevice] 파일 스트리밍 상태: ${streaming}`);
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
      originalMediaState: null,
      isSwitchingCamera: false
    });
  },
}));
