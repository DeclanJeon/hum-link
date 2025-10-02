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
  // 모바일
  isMobile: boolean;
  cameraFacing: CameraFacing;
  hasMultipleCameras: boolean;
  // 파일 스트리밍
  isFileStreaming: boolean;
  originalMediaState: OriginalMediaState | null;
  // 카메라 전환 중
  isSwitchingCamera: boolean;
  // 디바이스 변경 중
  isChangingDevice: boolean;
}

interface MediaDeviceActions {
  setLocalStream: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  // 모바일
  initializeMobileDetection: () => Promise<void>;
  switchCamera: () => Promise<void>;
  // 파일 스트리밍
  saveOriginalMediaState: () => void;
  restoreOriginalMediaState: () => Promise<boolean>;
  setFileStreaming: (streaming: boolean) => void;
  // 디바이스 변경 (통합)
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
    set({
      localStream: stream,
      isAudioEnabled: stream.getAudioTracks()[0]?.enabled ?? false,
      isVideoEnabled: stream.getVideoTracks()[0]?.enabled ?? false,
    });
    
    // 모바일 감지
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
   * 오디오 디바이스 변경 (Lobby + Room 통합)
   */
  changeAudioDevice: async (deviceId: string): Promise<boolean> => {
    const { localStream, isFileStreaming, isChangingDevice } = get();
    
    if (isChangingDevice) {
      console.warn('[MediaDevice] 디바이스 변경이 이미 진행 중입니다');
      return false;
    }
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 디바이스를 변경할 수 없습니다');
      return false;
    }
    
    if (!localStream) {
      console.error('[MediaDevice] 로컬 스트림이 없습니다');
      return false;
    }
    
    set({ isChangingDevice: true });
    
    try {
      console.log(`[MediaDevice] 오디오 디바이스 변경 시작: ${deviceId}`);
      
      // 1. 새로운 오디오 스트림 생성
      const newAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      
      const newAudioTrack = newAudioStream.getAudioTracks()[0];
      if (!newAudioTrack) {
        throw new Error('새로운 오디오 트랙을 가져올 수 없습니다');
      }
      
      const oldAudioTrack = localStream.getAudioTracks()[0];
      
      // 2. WebRTC Peer Connection 업데이트 (Room에서만)
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager && oldAudioTrack) {
        console.log('[MediaDevice] WebRTC Peer Connection에 오디오 트랙 교체 중...');
        
        try {
          await webRTCManager.replaceTrack(oldAudioTrack, newAudioTrack, localStream);
          console.log('[MediaDevice] WebRTC replaceTrack 성공');
        } catch (error) {
          console.warn('[MediaDevice] replaceTrack 실패, fallback 시도:', error);
          
          // Fallback: removeTrack + addTrack
          try {
            await webRTCManager.removeTrackFromAllPeers(oldAudioTrack, localStream);
            await webRTCManager.addTrackToAllPeers(newAudioTrack, localStream);
            console.log('[MediaDevice] Fallback 방식으로 트랙 교체 성공');
          } catch (fallbackError) {
            console.error('[MediaDevice] Fallback도 실패:', fallbackError);
            throw new Error('모든 트랙 교체 방법이 실패했습니다');
          }
        }
      }
      
      // 3. 로컬 스트림 업데이트
      if (oldAudioTrack) {
        localStream.removeTrack(oldAudioTrack);
        oldAudioTrack.stop();
      }
      localStream.addTrack(newAudioTrack);
      
      // 4. enabled 상태 유지
      const wasEnabled = get().isAudioEnabled;
      newAudioTrack.enabled = wasEnabled;
      
      // 5. Lobby Store 동기화 (Lobby 페이지인 경우)
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        useLobbyStore.setState({ stream: localStream });
        
        // 오디오 분석 재초기화
        const { initializeAudioAnalysis } = useLobbyStore.getState();
        initializeAudioAnalysis(localStream);
      }
      
      // 6. Signaling 서버에 상태 업데이트 (Room에서만)
      if (webRTCManager) {
        useSignalingStore.getState().updateMediaState({
          kind: 'audio',
          enabled: wasEnabled
        });
      }
      
      // 7. localStorage에 선호 디바이스 저장
      localStorage.setItem('preferredAudioDevice', deviceId);
      
      console.log('[MediaDevice] 오디오 디바이스 변경 완료');
      return true;
      
    } catch (error) {
      console.error('[MediaDevice] 오디오 디바이스 변경 실패:', error);
      toast.error('오디오 디바이스 변경에 실패했습니다');
      return false;
    } finally {
      set({ isChangingDevice: false });
    }
  },
  
  /**
   * 비디오 디바이스 변경 (Lobby + Room 통합)
   */
  changeVideoDevice: async (deviceId: string): Promise<boolean> => {
    const { localStream, isFileStreaming, isSharingScreen, isChangingDevice } = get();
    
    if (isChangingDevice) {
      console.warn('[MediaDevice] 디바이스 변경이 이미 진행 중입니다');
      return false;
    }
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 디바이스를 변경할 수 없습니다');
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
      console.log(`[MediaDevice] 비디오 디바이스 변경 시작: ${deviceId}`);
      
      // 1. 새로운 비디오 스트림 생성
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새로운 비디오 트랙을 가져올 수 없습니다');
      }
      
      const oldVideoTrack = localStream.getVideoTracks()[0];
      const wasEnabled = oldVideoTrack?.enabled || false;
      
      // 2. WebRTC Peer Connection 업데이트 (Room에서만)
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager && oldVideoTrack) {
        console.log('[MediaDevice] WebRTC Peer Connection에 비디오 트랙 교체 중...');
        
        try {
          await webRTCManager.replaceTrack(oldVideoTrack, newVideoTrack, localStream);
          console.log('[MediaDevice] WebRTC replaceTrack 성공');
        } catch (error) {
          console.warn('[MediaDevice] replaceTrack 실패, fallback 시도:', error);
          
          // Fallback: removeTrack + addTrack
          try {
            await webRTCManager.removeTrackFromAllPeers(oldVideoTrack, localStream);
            await webRTCManager.addTrackToAllPeers(newVideoTrack, localStream);
            console.log('[MediaDevice] Fallback 방식으로 트랙 교체 성공');
          } catch (fallbackError) {
            console.error('[MediaDevice] Fallback도 실패:', fallbackError);
            throw new Error('모든 트랙 교체 방법이 실패했습니다');
          }
        }
      }
      
      // 3. 로컬 스트림 업데이트
      if (oldVideoTrack) {
        localStream.removeTrack(oldVideoTrack);
        
        // 지연된 정지 (WebRTC 전파 대기)
        setTimeout(() => {
          if (oldVideoTrack.readyState !== 'ended') {
            oldVideoTrack.stop();
          }
        }, 500);
      }
      localStream.addTrack(newVideoTrack);
      
      // 4. enabled 상태 유지
      newVideoTrack.enabled = wasEnabled;
      
      // 5. Store 상태 업데이트
      set({ localStream });
      
      // 6. Lobby Store 동기화 (Lobby 페이지인 경우)
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        useLobbyStore.setState({ stream: localStream });
      }
      
      // 7. Signaling 서버에 상태 업데이트 (Room에서만)
      if (webRTCManager) {
        useSignalingStore.getState().updateMediaState({
          kind: 'video',
          enabled: wasEnabled
        });
      }
      
      // 8. localStorage에 선호 디바이스 저장
      localStorage.setItem('preferredVideoDevice', deviceId);
      
      console.log('[MediaDevice] 비디오 디바이스 변경 완료');
      return true;
      
    } catch (error) {
      console.error('[MediaDevice] 비디오 디바이스 변경 실패:', error);
      toast.error('비디오 디바이스 변경에 실패했습니다');
      return false;
    } finally {
      set({ isChangingDevice: false });
    }
  },

  /**
   * 모바일 카메라 전환 (전면/후면)
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
    
    // 검증 1. 중복 실행 방지
    if (isSwitchingCamera) {
      console.log('[MediaDevice] 카메라 전환이 이미 진행 중입니다');
      return;
    }
    
    if (!isMobile || !hasMultipleCameras) {
      toast.warning('모바일 기기에서만 카메라 전환이 가능합니다');
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
    
    // 전환 시작
    set({ isSwitchingCamera: true });
    
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (!currentVideoTrack) {
        throw new Error('비디오 트랙이 없습니다');
      }
      
      const wasEnabled = currentVideoTrack.enabled;
      const currentFacing = cameraManager.getCurrentFacing();
      const targetFacing: CameraFacing = currentFacing === 'user' ? 'environment' : 'user';
      
      console.log(`[MediaDevice] 카메라 전환: ${currentFacing} → ${targetFacing}`);
      console.log(`[MediaDevice] 현재 상태: enabled=${wasEnabled}, readyState=${currentVideoTrack.readyState}`);
      
      // 2단계: 새로운 카메라 스트림 생성
      let newStream: MediaStream;
      try {
        console.log('[MediaDevice] facingMode 제약 조건 사용...');
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (error: any) {
        console.warn('[MediaDevice] facingMode 실패, deviceId 방식 시도:', error.message);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        const currentDeviceId = currentVideoTrack.getSettings().deviceId;
        const nextCamera = cameras.find(cam => cam.deviceId !== currentDeviceId);
        
        if (!nextCamera) {
          throw new Error('다른 카메라를 찾을 수 없습니다');
        }
        
        console.log(`[MediaDevice] 대체 카메라 사용: ${nextCamera.label}`);
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextCamera.deviceId } },
          audio: false
        });
      }
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새로운 비디오 트랙을 가져올 수 없습니다');
      }
      
      console.log(`[MediaDevice] 새 비디오 트랙 생성됨: ${newVideoTrack.label}`);
      
      // 3단계: 오디오 트랙 복사 (있는 경우)
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        console.log('[MediaDevice] 오디오 트랙 복사 중...');
        newStream.addTrack(audioTrack);
      }
      
      // 4단계: WebRTC Peer Connection 업데이트
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTC 피어 연결 업데이트 중...');
        
        try {
          await webRTCManager.replaceTrack(currentVideoTrack, newVideoTrack, newStream);
          console.log('[MediaDevice] WebRTC 트랙 교체 성공');
        } catch (error) {
          console.error('[MediaDevice] WebRTC 트랙 교체 실패:', error);
          throw error;
        }
      }
      
      // 5단계: 로컬 스트림 업데이트 (즉시 반영)
      console.log('[MediaDevice] 로컬 스트림 업데이트 중...');
      set({
        localStream: newStream,
        cameraFacing: targetFacing,
        isVideoEnabled: wasEnabled
      });
      
      // 6단계: Lobby Store 업데이트
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        console.log('[MediaDevice] Lobby Store 업데이트 중...');
        useLobbyStore.setState({ stream: newStream });
      }
      
      // 7단계: Signaling 서버 업데이트
      useSignalingStore.getState().updateMediaState({
        kind: 'video',
        enabled: wasEnabled
      });
      
      // 8단계: 새 트랙의 enabled 상태 설정
      newVideoTrack.enabled = wasEnabled;
      console.log(`[MediaDevice] 새 트랙 enabled 설정: ${wasEnabled}`);
      
      // 9단계: 이전 트랙 정지 (지연 실행)
      setTimeout(() => {
        if (currentVideoTrack.readyState !== 'ended') {
          currentVideoTrack.stop();
          console.log('[MediaDevice] 이전 비디오 트랙 정지됨');
        }
      }, 500);
      
      // 성공 토스트
      toast.success(
        `${targetFacing === 'user' ? '전면' : '후면'} 카메라로 전환되었습니다`,
        { duration: 1500, position: 'top-center' }
      );
      
      console.log('[MediaDevice] 카메라 전환 완료');
      
    } catch (error: any) {
      console.error('[MediaDevice] 카메라 전환 실패:', error);
      toast.error(`카메라 전환 실패: ${error.message}`);
      
      // 롤백 시도
      try {
        console.log('[MediaDevice] 롤백 시도 중...');
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
      // 전환 완료
      set({ isSwitchingCamera: false });
    }
  },

  toggleAudio: () => {
    const { isFileStreaming, isAudioEnabled, localStream } = get();
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 오디오를 변경할 수 없습니다');
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
      toast.warning('파일 스트리밍 중에는 비디오를 변경할 수 없습니다');
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
      toast.error('WebRTC 매니저가 초기화되지 않았습니다');
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
        toast.info("화면 공유를 중지했습니다.");
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
        console.error("화면 공유 실패:", error);
        toast.error("화면 공유를 시작할 수 없습니다. 권한을 확인해주세요.");
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
    
    console.log('[MediaDevice] 미디어 상태 저장 완료:', {
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
      isSwitchingCamera: false,
      isChangingDevice: false
    });
  },
}));
