/**
 * @fileoverview 미디어 디바이스 상태 관리 Store
 * @module stores/useMediaDeviceStore
 */

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

  /**
   * 로컬 스트림 설정
   */
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
    
    // 모바일 감지 초기화
    get().initializeMobileDetection();
  },

  /**
   * 모바일 디바이스 감지 및 카메라 정보 초기화
   */
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
   * 오디오 디바이스 변경 (개선된 버전)
   * Lobby와 Room 모두에서 사용 가능
   */
  changeAudioDevice: async (deviceId: string): Promise<boolean> => {
    const { localStream, isFileStreaming, isChangingDevice } = get();
    
    if (isChangingDevice) {
      console.warn('[MediaDevice] 이미 디바이스 변경 중');
      return false;
    }
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 디바이스를 변경할 수 없습니다');
      return false;
    }
    
    if (!localStream) {
      console.error('[MediaDevice] 로컬 스트림 없음');
      return false;
    }
    
    set({ isChangingDevice: true });
    
    try {
      console.log(`[MediaDevice] 오디오 디바이스 변경 시작: ${deviceId.substring(0, 8)}`);
      
      // 1. 새로운 오디오 트랙 생성
      const newAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      
      const newAudioTrack = newAudioStream.getAudioTracks()[0];
      if (!newAudioTrack) {
        throw new Error('새 오디오 트랙 생성 실패');
      }
      
      const oldAudioTrack = localStream.getAudioTracks()[0];
      const wasEnabled = get().isAudioEnabled;
      
      console.log('[MediaDevice] 오디오 트랙 정보:', {
        oldTrack: oldAudioTrack ? {
          id: oldAudioTrack.id,
          label: oldAudioTrack.label,
          enabled: oldAudioTrack.enabled
        } : null,
        newTrack: {
          id: newAudioTrack.id,
          label: newAudioTrack.label,
          enabled: newAudioTrack.enabled
        }
      });
      
      // 2. WebRTC Peer Connection 트랙 교체 (Room에서만)
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager && oldAudioTrack) {
        console.log('[MediaDevice] WebRTC Peer Connection 오디오 트랙 교체 중...');
        
        try {
          // WebRTCManager의 localStream에서 먼저 트랙 교체
          const managerStream = webRTCManager.getLocalStream();
          if (managerStream) {
            const existingOldTrack = managerStream.getAudioTracks().find(
              t => t.id === oldAudioTrack.id
            );
            
            if (existingOldTrack) {
              managerStream.removeTrack(existingOldTrack);
              console.log('[MediaDevice] WebRTCManager localStream에서 이전 오디오 트랙 제거');
            }
            
            managerStream.addTrack(newAudioTrack);
            console.log('[MediaDevice] WebRTCManager localStream에 새 오디오 트랙 추가');
          }
          
          // Peer에 replaceTrack 호출
          await webRTCManager.replaceTrack(oldAudioTrack, newAudioTrack);
          console.log('[MediaDevice] WebRTC replaceTrack 완료');
          
        } catch (error) {
          console.error('[MediaDevice] WebRTC 트랙 교체 실패:', error);
          throw new Error('WebRTC 트랙 교체 실패');
        }
      }
      
      // 3. 로컬 스트림 트랙 교체 (Store의 localStream)
      if (oldAudioTrack) {
        localStream.removeTrack(oldAudioTrack);
      }
      localStream.addTrack(newAudioTrack);
      
      // 4. enabled 상태 적용
      newAudioTrack.enabled = wasEnabled;
      
      // 5. 이전 트랙 정리 (즉시)
      if (oldAudioTrack && oldAudioTrack.readyState !== 'ended') {
        oldAudioTrack.stop();
        console.log('[MediaDevice] 이전 오디오 트랙 정지');
      }
      
      // 6. Lobby Store 업데이트 (Lobby에서만)
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        useLobbyStore.setState({ stream: localStream });
        
        // 오디오 분석 재초기화
        const { initializeAudioAnalysis } = useLobbyStore.getState();
        initializeAudioAnalysis(localStream);
        
        console.log('[MediaDevice] Lobby 스트림 업데이트 및 오디오 분석 재초기화');
      }
      
      // 7. Signaling 업데이트 (Room에서만)
      if (webRTCManager) {
        useSignalingStore.getState().updateMediaState({
          kind: 'audio',
          enabled: wasEnabled
        });
        console.log('[MediaDevice] Signaling 오디오 상태 업데이트');
      }
      
      // 8. localStorage 저장
      localStorage.setItem('preferredAudioDevice', deviceId);
      
      console.log('[MediaDevice] 오디오 디바이스 변경 완료');
      return true;
      
    } catch (error: any) {
      console.error('[MediaDevice] 오디오 디바이스 변경 실패:', error);
      
      // 에러 타입별 사용자 친화적 메시지
      if (error.name === 'NotFoundError') {
        toast.error('마이크를 찾을 수 없습니다');
      } else if (error.name === 'NotAllowedError') {
        toast.error('마이크 권한이 거부되었습니다');
      } else if (error.message?.includes('WebRTC')) {
        toast.error('연결된 참가자에게 마이크 변경을 전달하지 못했습니다');
      } else {
        toast.error('마이크 변경 실패');
      }
      
      return false;
    } finally {
      set({ isChangingDevice: false });
    }
  },
  
  /**
   * 비디오 디바이스 변경 (개선된 버전)
   * Lobby와 Room 모두에서 사용 가능
   */
  changeVideoDevice: async (deviceId: string): Promise<boolean> => {
    const { localStream, isFileStreaming, isSharingScreen, isChangingDevice } = get();
    
    if (isChangingDevice) {
      console.warn('[MediaDevice] 이미 디바이스 변경 중');
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
      console.error('[MediaDevice] 로컬 스트림 없음');
      return false;
    }
    
    set({ isChangingDevice: true });
    
    try {
      console.log(`[MediaDevice] 비디오 디바이스 변경 시작: ${deviceId.substring(0, 8)}`);
      
      // 1. 새로운 비디오 트랙 생성
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('새 비디오 트랙 생성 실패');
      }
      
      const oldVideoTrack = localStream.getVideoTracks()[0];
      const wasEnabled = oldVideoTrack?.enabled || false;
      
      console.log('[MediaDevice] 비디오 트랙 정보:', {
        oldTrack: oldVideoTrack ? {
          id: oldVideoTrack.id,
          label: oldVideoTrack.label,
          enabled: oldVideoTrack.enabled
        } : null,
        newTrack: {
          id: newVideoTrack.id,
          label: newVideoTrack.label,
          enabled: newVideoTrack.enabled
        }
      });
      
      // 2. WebRTC Peer Connection 트랙 교체 (Room에서만)
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager && oldVideoTrack) {
        console.log('[MediaDevice] WebRTC Peer Connection 비디오 트랙 교체 중...');
        
        try {
          // WebRTCManager의 localStream에서 먼저 트랙 교체
          const managerStream = webRTCManager.getLocalStream();
          if (managerStream) {
            const existingOldTrack = managerStream.getVideoTracks().find(
              t => t.id === oldVideoTrack.id
            );
            
            if (existingOldTrack) {
              managerStream.removeTrack(existingOldTrack);
              console.log('[MediaDevice] WebRTCManager localStream에서 이전 비디오 트랙 제거');
            }
            
            managerStream.addTrack(newVideoTrack);
            console.log('[MediaDevice] WebRTCManager localStream에 새 비디오 트랙 추가');
          }
          
          // Peer에 replaceTrack 호출
          await webRTCManager.replaceTrack(oldVideoTrack, newVideoTrack);
          console.log('[MediaDevice] WebRTC replaceTrack 완료');
          
        } catch (error) {
          console.error('[MediaDevice] WebRTC 트랙 교체 실패:', error);
          throw new Error('WebRTC 트랙 교체 실패');
        }
      }
      
      // 3. 로컬 스트림 트랙 교체 (Store의 localStream)
      if (oldVideoTrack) {
        localStream.removeTrack(oldVideoTrack);
      }
      localStream.addTrack(newVideoTrack);
      
      // 4. enabled 상태 적용
      newVideoTrack.enabled = wasEnabled;
      
      // 5. Store 업데이트
      set({ localStream });
      
      // 6. 이전 트랙 정리 (즉시)
      if (oldVideoTrack && oldVideoTrack.readyState !== 'ended') {
        oldVideoTrack.stop();
        console.log('[MediaDevice] 이전 비디오 트랙 정지');
      }
      
      // 7. Lobby Store 업데이트 (Lobby에서만)
      const { stream: lobbyStream } = useLobbyStore.getState();
      if (lobbyStream) {
        useLobbyStore.setState({ stream: localStream });
        console.log('[MediaDevice] Lobby 스트림 업데이트');
      }
      
      // 8. Signaling 업데이트 (Room에서만)
      if (webRTCManager) {
        useSignalingStore.getState().updateMediaState({
          kind: 'video',
          enabled: wasEnabled
        });
        console.log('[MediaDevice] Signaling 비디오 상태 업데이트');
      }
      
      // 9. localStorage 저장
      localStorage.setItem('preferredVideoDevice', deviceId);
      
      console.log('[MediaDevice] 비디오 디바이스 변경 완료');
      return true;
      
    } catch (error: any) {
      console.error('[MediaDevice] 비디오 디바이스 변경 실패:', error);
      
      // 에러 타입별 사용자 친화적 메시지
      if (error.name === 'NotFoundError') {
        toast.error('카메라를 찾을 수 없습니다');
      } else if (error.name === 'NotAllowedError') {
        toast.error('카메라 권한이 거부되었습니다');
      } else if (error.message?.includes('WebRTC')) {
        toast.error('연결된 참가자에게 카메라 변경을 전달하지 못했습니다');
      } else {
        toast.error('카메라 변경 실패');
      }
      
      return false;
    } finally {
      set({ isChangingDevice: false });
    }
  },

  /**
   * 카메라 전환 (전면/후면)
   * 모바일 디바이스에서만 사용 가능
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
    
    // 1. 유효성 검사
    if (isSwitchingCamera) {
      console.log('[MediaDevice] 이미 카메라 전환 중');
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
      toast.error('스트림 없음');
      return;
    }
    
    // 2. 플래그 설정
    set({ isSwitchingCamera: true });
    
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (!currentVideoTrack) {
        throw new Error('현재 비디오 트랙 없음');
      }
      
      const wasEnabled = currentVideoTrack.enabled;
      const currentFacing = cameraManager.getCurrentFacing();
      const targetFacing: CameraFacing = currentFacing === 'user' ? 'environment' : 'user';
      
      console.log(`[MediaDevice] 카메라 전환: ${currentFacing} → ${targetFacing}`);
      console.log(`[MediaDevice] 현재 트랙: enabled=${wasEnabled}, readyState=${currentVideoTrack.readyState}`);
      
      // 3. 새로운 카메라 스트림 생성 (facingMode 우선)
      let newVideoStream: MediaStream;
      try {
        console.log('[MediaDevice] facingMode 제약 조건 사용 중...');
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
        
        // Fallback: deviceId로 시도
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        const currentDeviceId = currentVideoTrack.getSettings().deviceId;
        const nextCamera = cameras.find(cam => cam.deviceId !== currentDeviceId);
        
        if (!nextCamera) {
          throw new Error('사용 가능한 다른 카메라가 없습니다');
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
        throw new Error('새 비디오 트랙 생성 실패');
      }
      
      console.log(`[MediaDevice] 새 비디오 트랙: ${newVideoTrack.label}`);
      
      // 4. WebRTC 트랙 교체
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        console.log('[MediaDevice] WebRTC 트랙 교체 중...');
        
        try {
          // WebRTCManager의 localStream에서 먼저 트랙 교체
          const managerStream = webRTCManager.getLocalStream();
          if (managerStream) {
            managerStream.removeTrack(currentVideoTrack);
            managerStream.addTrack(newVideoTrack);
            console.log('[MediaDevice] WebRTCManager localStream 트랙 교체 완료');
          }
          
          // Peer에 replaceTrack 호출
          await webRTCManager.replaceTrack(currentVideoTrack, newVideoTrack);
          console.log('[MediaDevice] WebRTC 트랙 교체 성공');
        } catch (error) {
          console.error('[MediaDevice] WebRTC 트랙 교체 실패:', error);
          throw error;
        }
      }
      
      // 5. 로컬 스트림 트랙 교체
      console.log('[MediaDevice] 로컬 스트림 트랙 교체 중...');
      localStream.removeTrack(currentVideoTrack);
      localStream.addTrack(newVideoTrack);
      newVideoTrack.enabled = wasEnabled;
      
      // 6. 상태 업데이트 (즉시 반영)
      set({
        cameraFacing: targetFacing,
        isVideoEnabled: wasEnabled
      });
      
      // 7. CameraManager 업데이트
      cameraManager.setCurrentFacing(targetFacing);
      
      // 8. Signaling 업데이트
      useSignalingStore.getState().updateMediaState({
        kind: 'video',
        enabled: wasEnabled
      });
      
      // 9. 이전 트랙 정리 (즉시)
      if (currentVideoTrack.readyState !== 'ended') {
        currentVideoTrack.stop();
        console.log('[MediaDevice] 이전 비디오 트랙 정지');
      }
      
      // 10. 사용자 피드백
      toast.success(
        `${targetFacing === 'user' ? '전면' : '후면'} 카메라로 전환`,
        { duration: 1500, position: 'top-center' }
      );
      
      console.log('[MediaDevice] 카메라 전환 완료');
      
    } catch (error: any) {
      console.error('[MediaDevice] 카메라 전환 실패:', error);
      
      // 에러 타입별 사용자 친화적 메시지
      if (error.name === 'NotFoundError') {
        toast.error('카메라를 찾을 수 없습니다');
      } else if (error.name === 'NotAllowedError') {
        toast.error('카메라 권한이 필요합니다');
      } else {
        toast.error(`카메라 전환 실패: ${error.message || error}`);
      }
      
      // 롤백 시도
      try {
        console.log('[MediaDevice] 카메라 전환 롤백 시도...');
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
      // 12. 플래그 해제
      set({ isSwitchingCamera: false });
    }
  },

  /**
   * 오디오 토글
   */
  toggleAudio: () => {
    const { isFileStreaming, isAudioEnabled, localStream } = get();
    
    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 마이크를 제어할 수 없습니다');
      return;
    }
    
    const enabled = !isAudioEnabled;
    localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    useSignalingStore.getState().updateMediaState({ kind: 'audio', enabled });
    set({ isAudioEnabled: enabled });
    
    console.log('[MediaDevice] Audio toggled:', enabled);
  },

  /**
   * 비디오 토글
   */
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

  /**
   * 화면 공유 토글
   */
  toggleScreenShare: async (toast: any) => {
    const { isSharingScreen, localStream, originalVideoTrack, isVideoEnabled, preShareVideoState, isFileStreaming } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();

    if (isFileStreaming) {
      toast.warning('파일 스트리밍 중에는 화면 공유를 시작할 수 없습니다');
      return;
    }

    if (!webRTCManager) {
      toast.error('WebRTC 초기화 안됨');
      return;
    }

    if (isSharingScreen) {
      // 화면 공유 중지
      if (originalVideoTrack && localStream) {
        const screenTrack = localStream.getVideoTracks()[0];
        
        // WebRTCManager의 localStream에서 먼저 트랙 교체
        const managerStream = webRTCManager.getLocalStream();
        if (managerStream) {
          managerStream.removeTrack(screenTrack);
          managerStream.addTrack(originalVideoTrack);
        }
        
        // Peer에 replaceTrack 호출
        webRTCManager.replaceTrack(screenTrack, originalVideoTrack);
        
        // 로컬 스트림 트랙 교체
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
        toast.info("화면 공유 중지됨.");
        
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

          // WebRTCManager의 localStream에서 먼저 트랙 교체
          const managerStream = webRTCManager.getLocalStream();
          if (managerStream) {
            managerStream.removeTrack(currentVideoTrack);
            managerStream.addTrack(screenTrack);
          }
          
          // Peer에 replaceTrack 호출
          webRTCManager.replaceTrack(currentVideoTrack, screenTrack);
          
          // 로컬 스트림 트랙 교체
          localStream.removeTrack(currentVideoTrack);
          localStream.addTrack(screenTrack);
          
          set({ isSharingScreen: true, isVideoEnabled: true });
          useSignalingStore.getState().updateMediaState({ kind: 'video', enabled: true });
          
          screenTrack.onended = () => {
            if (get().isSharingScreen) {
              get().toggleScreenShare(toast);
            }
          };
          toast.success("화면 공유 시작됨.");
          
          console.log('[MediaDevice] Screen share started');
        }
      } catch (error) {
        console.error("[MediaDevice] 화면 공유 시작 실패:", error);
        toast.error("화면 공유 시작 실패. 다시 시도해주세요.");
      }
    }
  },

  /**
   * 원본 미디어 상태 저장 (파일 스트리밍 전)
   */
  saveOriginalMediaState: () => {
    const { localStream, isAudioEnabled, isVideoEnabled, isSharingScreen } = get();
    
    if (!localStream) {
      console.warn('[MediaDevice] 로컬 스트림이 없어 상태를 저장할 수 없습니다');
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

  /**
   * 원본 미디어 상태 복원 (파일 스트리밍 후)
   */
  restoreOriginalMediaState: async () => {
    const { originalMediaState, localStream } = get();
    
    if (!originalMediaState || !localStream) {
      console.error('[MediaDevice] 복원할 상태가 없습니다');
      return false;
    }
    
    console.log('[MediaDevice] 원본 미디어 상태 복원 중...');
    
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
      
      console.log('[MediaDevice] 원본 미디어 상태 복원 완료:', {
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        audioTrackEnabled: originalMediaState.audioTrackEnabled,
        videoTrackEnabled: originalMediaState.videoTrackEnabled
      });
      
      return true;
    } catch (error) {
      console.error('[MediaDevice] 원본 미디어 상태 복원 실패:', error);
      set({ originalMediaState: null, isFileStreaming: false });
      return false;
    }
  },

  /**
   * 파일 스트리밍 상태 설정
   */
  setFileStreaming: (streaming: boolean) => {
    set({ isFileStreaming: streaming });
    console.log(`[MediaDevice] 파일 스트리밍 상태: ${streaming}`);
  },

  /**
   * 정리 (cleanup)
   */
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
