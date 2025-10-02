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
  isMobile: boolean;
  cameraFacing: CameraFacing;
  hasMultipleCameras: boolean;
  isFileStreaming: boolean;
  originalMediaState: OriginalMediaState | null;
  isSwitchingCamera: boolean;
  isChangingDevice: boolean;
}

interface MediaDeviceActions {
  setLocalStream: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  initializeMobileDetection: () => Promise<void>;
  switchCamera: () => Promise<void>;
  saveOriginalMediaState: () => void;
  restoreOriginalMediaState: () => Promise<boolean>;
  setFileStreaming: (streaming: boolean) => void;
  changeAudioDevice: (deviceId: string) => Promise<boolean>;
  changeVideoDevice: (deviceId: string) => Promise<boolean>;
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
  isChangingDevice: false,

  setLocalStream: (stream) => {
    console.log('[MediaDevice] Setting local stream:', {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
      streamId: stream.id
    });
    
    set({
      localStream: stream,
      isAudioEnabled: stream.getAudioTracks()[0]?.enabled ?? false,
      isVideoEnabled: stream.getVideoTracks()[0]?.enabled ?? false,
    });
    
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
    
    console.log('[MediaDevice] Mobile detection:', { 
      isMobile, 
      cameraCount: cameras.length,
      facing: cameraManager.getCurrentFacing()
    });
  },

  /**
   * 🔥 개선된 오디오 디바이스 변경 메서드
   */
  changeAudioDevice: async (deviceId: string): Promise<boolean> => {
    const { localStream, isFileStreaming, isChangingDevice } = get();
    
    if (isChangingDevice) {
      console.warn('[MediaDevice] 이미 디바이스 변경 중입니다');
      return false;
    }
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 장치를 변경할 수 없습니다');
      return false;
    }
    
    if (!localStream) {
      console.error('[MediaDevice] 로컬 스트림이 없습니다');
      return false;
    }
    
    set({ isChangingDevice: true });
    
    try {
      console.log(`[MediaDevice] 🎤 오디오 디바이스 변경 시작: ${deviceId.substring(0, 8)}`);
      
      // 1. 새 오디오 스트림 생성
      const newAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      
      const newAudioTrack = newAudioStream.getAudioTracks()[0];
      if (!newAudioTrack) {
        throw new Error('새 오디오 트랙을 생성할 수 없습니다');
      }
      
      console.log(`[MediaDevice] 새 오디오 트랙 생성: ${newAudioTrack.label}`);
      
      const oldAudioTrack = localStream.getAudioTracks()[0];
      const wasEnabled = get().isAudioEnabled;
      
      console.log(`[MediaDevice] 이전 오디오 트랙: ${oldAudioTrack?.label || 'none'}, enabled: ${wasEnabled}`);
      
      // 🔥 2. localStream 먼저 업데이트 (WebRTC replaceTrack 전에!)
      if (oldAudioTrack) {
        localStream.removeTrack(oldAudioTrack);
        console.log('[MediaDevice] 이전 오디오 트랙 제거됨');
      }
      localStream.addTrack(newAudioTrack);
      console.log('[MediaDevice] 새 오디오 트랙 추가됨');
      
      // 🔥 3. WebRTCManager의 localStream도 업데이트
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTCManager.localStream 업데이트 중...');
        webRTCManager.updateLocalStream(localStream);
        console.log('[MediaDevice] WebRTCManager.localStream 업데이트 완료');
      }
      
      // 🔥 4. 이제 WebRTC Peer Connection에 replaceTrack 호출
      if (webRTCManager && oldAudioTrack) {
        console.log('[MediaDevice] WebRTC Peer Connection 트랙 교체 중...');
        
        try {
          await webRTCManager.replaceTrack(oldAudioTrack, newAudioTrack, localStream);
          console.log('[MediaDevice] ✅ WebRTC replaceTrack 성공');
        } catch (error) {
          console.error('[MediaDevice] ❌ WebRTC replaceTrack 실패:', error);
          throw new Error('원격 피어 트랙 교체 실패');
        }
      }
      
      // 🔥 5. 이전 트랙 정리 (replaceTrack 이후!)
      if (oldAudioTrack) {
        // 약간의 지연을 두어 WebRTC 전송 완료 대기
        setTimeout(() => {
          if (oldAudioTrack.readyState !== 'ended') {
            oldAudioTrack.stop();
            console.log('[MediaDevice] 이전 오디오 트랙 정리 완료');
          }
        }, 500);
      }
      
      // 6. enabled 상태 복원
      newAudioTrack.enabled = wasEnabled;
      
      // 7. Lobby Store 업데이트 (Lobby 페이지인 경우)
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        useLobbyStore.setState({ stream: localStream });
        
        const { initializeAudioAnalysis } = useLobbyStore.getState();
        initializeAudioAnalysis(localStream);
        console.log('[MediaDevice] Lobby 오디오 분석 재초기화 완료');
      }
      
      // 8. Signaling 업데이트 (Room 페이지인 경우)
      if (webRTCManager) {
        useSignalingStore.getState().updateMediaState({
          kind: 'audio',
          enabled: wasEnabled
        });
        console.log('[MediaDevice] Signaling 미디어 상태 업데이트 완료');
      }
      
      // 9. localStorage 저장
      localStorage.setItem('preferredAudioDevice', deviceId);
      
      console.log('[MediaDevice] ✅ 오디오 디바이스 변경 완료');
      return true;
      
    } catch (error) {
      console.error('[MediaDevice] ❌ 오디오 디바이스 변경 실패:', error);
      toast.error('오디오 장치 변경에 실패했습니다');
      return false;
    } finally {
      set({ isChangingDevice: false });
    }
  },
  
  /**
   * 🔥 개선된 비디오 디바이스 변경 메서드
   */
  changeVideoDevice: async (deviceId: string): Promise<boolean> => {
    const { localStream, isFileStreaming, isSharingScreen, isChangingDevice } = get();
    
    if (isChangingDevice) {
      console.warn('[MediaDevice] 이미 디바이스 변경 중입니다');
      return false;
    }
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 장치를 변경할 수 없습니다');
      return false;
    }
    
    if (isSharingScreen) {
      toast.warning('화면 공유 중에는 카메라를 변경할 수 없습니다');
      return false;
    }
    
    if (!localStream) {
      console.error('[MediaDevice] 로컬 스트림이 없습니다');
      return false;
    }
    
    set({ isChangingDevice: true });
    
    try {
      console.log(`[MediaDevice] 📹 비디오 디바이스 변경 시작: ${deviceId.substring(0, 8)}`);
      
      // 1. 새 비디오 스트림 생성
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새 비디오 트랙을 생성할 수 없습니다');
      }
      
      console.log(`[MediaDevice] 새 비디오 트랙 생성: ${newVideoTrack.label}`);
      
      const oldVideoTrack = localStream.getVideoTracks()[0];
      const wasEnabled = oldVideoTrack?.enabled || false;
      
      console.log(`[MediaDevice] 이전 비디오 트랙: ${oldVideoTrack?.label || 'none'}, enabled: ${wasEnabled}`);
      
      // 🔥 2. localStream 먼저 업데이트 (WebRTC replaceTrack 전에!)
      if (oldVideoTrack) {
        localStream.removeTrack(oldVideoTrack);
        console.log('[MediaDevice] 이전 비디오 트랙 제거됨');
      }
      localStream.addTrack(newVideoTrack);
      console.log('[MediaDevice] 새 비디오 트랙 추가됨');
      
      // 🔥 3. WebRTCManager의 localStream도 업데이트
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTCManager.localStream 업데이트 중...');
        webRTCManager.updateLocalStream(localStream);
        console.log('[MediaDevice] WebRTCManager.localStream 업데이트 완료');
      }
      
      // 🔥 4. 이제 WebRTC Peer Connection에 replaceTrack 호출
      if (webRTCManager && oldVideoTrack) {
        console.log('[MediaDevice] WebRTC Peer Connection 트랙 교체 중...');
        
        try {
          await webRTCManager.replaceTrack(oldVideoTrack, newVideoTrack, localStream);
          console.log('[MediaDevice] ✅ WebRTC replaceTrack 성공');
        } catch (error) {
          console.error('[MediaDevice] ❌ WebRTC replaceTrack 실패:', error);
          throw new Error('원격 피어 트랙 교체 실패');
        }
      }
      
      // 🔥 5. 이전 트랙 정리 (replaceTrack 이후!)
      if (oldVideoTrack) {
        // 약간의 지연을 두어 WebRTC 전송 완료 대기
        setTimeout(() => {
          if (oldVideoTrack.readyState !== 'ended') {
            oldVideoTrack.stop();
            console.log('[MediaDevice] 이전 비디오 트랙 정리 완료');
          }
        }, 500);
      }
      
      // 6. enabled 상태 복원
      newVideoTrack.enabled = wasEnabled;
      
      // 7. Store 상태 업데이트
      set({ localStream });
      
      // 8. Lobby Store 업데이트 (Lobby 페이지인 경우)
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        useLobbyStore.setState({ stream: localStream });
        console.log('[MediaDevice] Lobby 스트림 업데이트 완료');
      }
      
      // 9. Signaling 업데이트 (Room 페이지인 경우)
      if (webRTCManager) {
        useSignalingStore.getState().updateMediaState({
          kind: 'video',
          enabled: wasEnabled
        });
        console.log('[MediaDevice] Signaling 미디어 상태 업데이트 완료');
      }
      
      // 10. localStorage 저장
      localStorage.setItem('preferredVideoDevice', deviceId);
      
      console.log('[MediaDevice] ✅ 비디오 디바이스 변경 완료');
      return true;
      
    } catch (error) {
      console.error('[MediaDevice] ❌ 비디오 디바이스 변경 실패:', error);
      toast.error('비디오 장치 변경에 실패했습니다');
      return false;
    } finally {
      set({ isChangingDevice: false });
    }
  },

  /**
   * 🔥 개선된 카메라 전환 메서드 (전/후면 카메라)
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
    
    if (isSwitchingCamera) {
      console.log('[MediaDevice] 이미 카메라 전환 중입니다');
      return;
    }
    
    if (!isMobile || !hasMultipleCameras) {
      toast.warning('모바일 디바이스가 아니거나 카메라가 하나뿐입니다');
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
    
    set({ isSwitchingCamera: true });
    
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (!currentVideoTrack) {
        throw new Error('현재 비디오 트랙이 없습니다');
      }
      
      const wasEnabled = currentVideoTrack.enabled;
      const currentFacing = cameraManager.getCurrentFacing();
      const targetFacing: CameraFacing = currentFacing === 'user' ? 'environment' : 'user';
      
      console.log(`[MediaDevice] 📱 카메라 전환: ${currentFacing} → ${targetFacing}`);
      console.log(`[MediaDevice] 현재 상태: enabled=${wasEnabled}, readyState=${currentVideoTrack.readyState}`);
      
      // 1. 새 비디오 스트림 생성
      let newVideoStream: MediaStream;
      try {
        console.log('[MediaDevice] facingMode 제약으로 스트림 생성 시도...');
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (error: any) {
        console.warn('[MediaDevice] facingMode 실패, deviceId 방식으로 재시도:', error.message);
        
        // Fallback: deviceId 사용
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        const currentDeviceId = currentVideoTrack.getSettings().deviceId;
        const nextCamera = cameras.find(cam => cam.deviceId !== currentDeviceId);
        
        if (!nextCamera) {
          throw new Error('다른 카메라를 찾을 수 없습니다');
        }
        
        console.log(`[MediaDevice] 다음 카메라 사용: ${nextCamera.label}`);
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            deviceId: { exact: nextCamera.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }
      
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새 비디오 트랙을 생성할 수 없습니다');
      }
      
      console.log(`[MediaDevice] 새 비디오 트랙 생성: ${newVideoTrack.label}`);
      
      // 🔥 2. localStream 먼저 업데이트
      console.log('[MediaDevice] 로컬 스트림 트랙 교체 중...');
      localStream.removeTrack(currentVideoTrack);
      localStream.addTrack(newVideoTrack);
      newVideoTrack.enabled = wasEnabled;
      
      // 🔥 3. WebRTCManager의 localStream도 업데이트
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTCManager.localStream 업데이트 중...');
        webRTCManager.updateLocalStream(localStream);
      }
      
      // 🔥 4. WebRTC Peer Connection 트랙 교체
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTC 원격 피어 트랙 교체 중...');
        
        try {
          await webRTCManager.replaceTrack(currentVideoTrack, newVideoTrack, localStream);
          console.log('[MediaDevice] ✅ WebRTC 트랙 교체 성공');
        } catch (error) {
          console.error('[MediaDevice] ❌ WebRTC 트랙 교체 실패:', error);
          throw error;
        }
      }
      
      // 5. 상태 업데이트
      set({
        cameraFacing: targetFacing,
        isVideoEnabled: wasEnabled
      });
      
      // 6. CameraManager 상태 동기화
      cameraManager.setCurrentFacing(targetFacing);
      
      // 7. Signaling 업데이트
      useSignalingStore.getState().updateMediaState({
        kind: 'video',
        enabled: wasEnabled
      });
      
      // 🔥 8. 이전 트랙 정리 (replaceTrack 이후!)
      setTimeout(() => {
        if (currentVideoTrack.readyState !== 'ended') {
          currentVideoTrack.stop();
          console.log('[MediaDevice] 이전 비디오 트랙 정리 완료');
        }
      }, 300);
      
      // 9. 사용자 피드백
      toast.success(
        `${targetFacing === 'user' ? '전면' : '후면'} 카메라로 전환됨`,
        { duration: 1500, position: 'top-center' }
      );
      
      console.log('[MediaDevice] ✅ 카메라 전환 완료');
      
    } catch (error: any) {
      console.error('[MediaDevice] ❌ 카메라 전환 실패:', error);
      toast.error(`카메라 전환 실패: ${error.message || error}`);
      
      // 롤백 시도
      try {
        console.log('[MediaDevice] 롤백 시도...');
        const { webRTCManager } = usePeerConnectionStore.getState();
        if (webRTCManager && localStream) {
          const track = localStream.getVideoTracks()[0];
          if (track && track.readyState === 'live') {
            webRTCManager.updateLocalStream(localStream);
            console.log('[MediaDevice] 롤백 완료');
          }
        }
      } catch (rollbackError) {
        console.error('[MediaDevice] 롤백 실패:', rollbackError);
      }
    } finally {
      set({ isSwitchingCamera: false });
    }
  },

  toggleAudio: () => {
    const { isFileStreaming, isAudioEnabled, localStream } = get();
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 오디오를 제어할 수 없습니다');
      return;
    }
    
    const enabled = !isAudioEnabled;
    localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    useSignalingStore.getState().updateMediaState({ kind: 'audio', enabled });
    set({ isAudioEnabled: enabled });
    
    console.log('[MediaDevice] Audio toggled:', enabled);
  },

  toggleVideo: () => {
    const { isVideoEnabled, isSharingScreen, localStream, isFileStreaming } = get();
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 비디오를 제어할 수 없습니다');
      return;
    }
    
    const enabled = !isVideoEnabled;
    if (!isSharingScreen) {
      localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
      useSignalingStore.getState().updateMediaState({ kind: 'video', enabled });
    }
    set({ isVideoEnabled: enabled });
    
    console.log('[MediaDevice] Video toggled:', enabled);
  },

  toggleScreenShare: async (toast: any) => {
    const { isSharingScreen, localStream, originalVideoTrack, isVideoEnabled, preShareVideoState, isFileStreaming } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();

    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 화면 공유를 할 수 없습니다');
      return;
    }

    if (!webRTCManager) {
      toast.error('WebRTC 매니저가 초기화되지 않았습니다');
      return;
    }

    if (isSharingScreen) {
      // 화면 공유 중지
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
        toast.info("화면 공유가 중지되었습니다.");
        
        console.log('[MediaDevice] Screen share stopped');
      }
    } else {
      // 화면 공유 시작
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
          toast.success("화면 공유가 시작되었습니다.");
          
          console.log('[MediaDevice] Screen share started');
        }
      } catch (error) {
        console.error("[MediaDevice] 화면 공유 실패:", error);
        toast.error("화면 공유를 시작할 수 없습니다. 권한을 확인하세요.");
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
    
    console.log('[MediaDevice] 미디어 상태 저장:', {
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
      console.error('[MediaDevice] 복원할 상태가 없습니다');
      return false;
    }
    
    console.log('[MediaDevice] 미디어 상태 복원 중...');
    
    try {
      // 1. 오디오 복원
      const currentAudioTrack = localStream.getAudioTracks()[0];
      if (originalMediaState.audioTrack && currentAudioTrack) {
        currentAudioTrack.enabled = originalMediaState.audioTrackEnabled;
      }
      
      // 2. 비디오 복원
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (originalMediaState.videoTrack && currentVideoTrack) {
        currentVideoTrack.enabled = originalMediaState.videoTrackEnabled;
      }
      
      // 3. 상태 복원
      set({
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        isSharingScreen: originalMediaState.isSharingScreen,
        originalMediaState: null,
        isFileStreaming: false
      });
      
      // 4. 시그널링 업데이트
      const { updateMediaState } = useSignalingStore.getState();
      updateMediaState({ kind: 'audio', enabled: originalMediaState.isAudioEnabled });
      updateMediaState({ kind: 'video', enabled: originalMediaState.isVideoEnabled });
      
      console.log('[MediaDevice] 미디어 상태 복원 완료:', {
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
    console.log('[MediaDevice] Cleaning up...');
    
    get().localStream?.getTracks().forEach(track => {
      track.stop();
      console.log('[MediaDevice] Stopped track:', track.kind, track.label);
    });
    
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
      isSwitchingCamera: false,
      isChangingDevice: false
    });
    
    console.log('[MediaDevice] Cleanup complete');
  },
}));
