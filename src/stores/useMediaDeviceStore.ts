import { create } from 'zustand';
import { deviceManager } from '@/services/deviceManager';
import { DeviceInfo } from '@/lib/deviceUtils';
import { usePeerConnectionStore } from './usePeerConnectionStore';
import { useSignalingStore } from './useSignalingStore';
import { toast } from 'sonner';
import { StreamStateManager } from '@/services/streamStateManager';
import { useUIManagementStore } from './useUIManagementStore';
import { useSessionStore } from './useSessionStore';

interface ScreenShareResources {
  screenVideoEl: HTMLVideoElement | null;
  cameraVideoEl: HTMLVideoElement | null;
  audioContext: AudioContext | null;
  animationFrameId: number | null;
}

/**
 * 파일 스트리밍을 위한 원본 미디어 상태
 */
interface OriginalMediaState {
  stream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
}

interface MediaDeviceState {
  localStream: MediaStream | null;
  audioInputs: DeviceInfo[];
  videoInputs: DeviceInfo[];
  audioOutputs: DeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
  originalStream: MediaStream | null;
  isMobile: boolean;
  hasMultipleCameras: boolean;
  isChangingDevice: boolean;
  streamStateManager: StreamStateManager;
  includeCameraInScreenShare: boolean;
  screenShareResources: ScreenShareResources | null;
  
  // 파일 스트리밍 관련 상태
  isFileStreaming: boolean;
  originalMediaState: OriginalMediaState | null;
}

interface MediaDeviceActions {
  initialize: () => Promise<void>;
  changeAudioDevice: (deviceId: string) => Promise<void>;
  changeVideoDevice: (deviceId: string) => Promise<void>;
  switchCamera: () => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  setIncludeCameraInScreenShare: (include: boolean) => void;
  cleanup: () => void;
  
  // 파일 스트리밍 관련 액션
  saveOriginalMediaState: () => void;
  restoreOriginalMediaState: () => Promise<boolean>;
  setFileStreaming: (isStreaming: boolean) => void;
}

export const useMediaDeviceStore = create<MediaDeviceState & MediaDeviceActions>((set, get) => ({
  localStream: null,
  audioInputs: [],
  videoInputs: [],
  audioOutputs: [],
  selectedAudioDeviceId: '',
  selectedVideoDeviceId: '',
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,
  originalStream: null,
  isMobile: false,
  hasMultipleCameras: false,
  isChangingDevice: false,
  streamStateManager: new StreamStateManager(),
  includeCameraInScreenShare: true,
  screenShareResources: null,
  
  // 파일 스트리밍 초기 상태
  isFileStreaming: false,
  originalMediaState: null,

  initialize: async () => {
    console.log('[MediaDeviceStore] Initializing...');
    try {
      await deviceManager.initialize();
      const stream = deviceManager.getCurrentStream();
      const devices = deviceManager.getDevices();
      const selected = deviceManager.getSelectedDevices();
      set({
        localStream: stream,
        audioInputs: devices.audioInputs,
        videoInputs: devices.videoInputs,
        audioOutputs: devices.audioOutputs,
        selectedAudioDeviceId: selected.audioDeviceId,
        selectedVideoDeviceId: selected.videoDeviceId,
        isMobile: deviceManager.isMobile,
        hasMultipleCameras: devices.videoInputs.length > 1,
      });
      deviceManager.onDeviceChange(() => {
        const updatedDevices = deviceManager.getDevices();
        set({
          audioInputs: updatedDevices.audioInputs,
          videoInputs: updatedDevices.videoInputs,
          audioOutputs: updatedDevices.audioOutputs,
          hasMultipleCameras: updatedDevices.videoInputs.length > 1,
        });
      });
      console.log('[MediaDeviceStore] Initialized successfully');
    } catch (error) {
      console.error('[MediaDeviceStore] Initialization failed:', error);
      toast.error('미디어 장치를 초기화하는 데 실패했습니다.');
    }
  },

  changeAudioDevice: async (deviceId: string) => {
    if (get().isChangingDevice) return;
    set({ isChangingDevice: true });
    try {
      const newStream = await deviceManager.changeAudioDevice(deviceId);
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        await webRTCManager.replaceLocalStream(newStream);
      }
      set({ localStream: newStream, selectedAudioDeviceId: deviceId });
      useSignalingStore.getState().updateMediaState({ kind: 'audio', enabled: get().isAudioEnabled });
      toast.success('마이크가 변경되었습니다.');
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to change audio device:', error);
      toast.error('마이크를 변경하는 데 실패했습니다.');
    } finally {
      set({ isChangingDevice: false });
    }
  },

  changeVideoDevice: async (deviceId: string) => {
    if (get().isChangingDevice) return;
    set({ isChangingDevice: true });
    try {
      const newStream = await deviceManager.changeVideoDevice(deviceId);
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        await webRTCManager.replaceLocalStream(newStream);
      }
      set({ localStream: newStream, selectedVideoDeviceId: deviceId });
      useSignalingStore.getState().updateMediaState({ kind: 'video', enabled: get().isVideoEnabled });
      toast.success('카메라가 변경되었습니다.');
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to change video device:', error);
      toast.error('카메라를 변경하는 데 실패했습니다.');
    } finally {
      set({ isChangingDevice: false });
    }
  },

  switchCamera: async () => {
    if (!get().isMobile || get().isChangingDevice) return;
    set({ isChangingDevice: true });
    try {
      const newStream = await deviceManager.switchCamera();
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        await webRTCManager.replaceLocalStream(newStream);
      }
      const selected = deviceManager.getSelectedDevices();
      set({ localStream: newStream, selectedVideoDeviceId: selected.videoDeviceId });
      toast.success('카메라가 전환되었습니다.', { duration: 1500 });
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to switch camera:', error);
      toast.error('카메라를 전환하는 데 실패했습니다.');
    } finally {
      set({ isChangingDevice: false });
    }
  },

  toggleAudio: () => {
    const { localStream, isAudioEnabled } = get();
    const newState = !isAudioEnabled;
    localStream?.getAudioTracks().forEach(track => { track.enabled = newState; });
    set({ isAudioEnabled: newState });
    useSignalingStore.getState().updateMediaState({ kind: 'audio', enabled: newState });
  },

  toggleVideo: () => {
    const { localStream, isVideoEnabled } = get();
    const newState = !isVideoEnabled;
    localStream?.getVideoTracks().forEach(track => { track.enabled = newState; });
    set({ isVideoEnabled: newState });
    useSignalingStore.getState().updateMediaState({ kind: 'video', enabled: newState });
  },
  
  toggleScreenShare: async () => {
    const { isSharingScreen } = get();
    if (isSharingScreen) {
      await get().stopScreenShare();
    } else {
      await get().startScreenShare();
    }
  },

  startScreenShare: async () => {
    const { localStream, streamStateManager, includeCameraInScreenShare } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();
    const { setMainContentParticipant } = useUIManagementStore.getState();
    const localUserId = useSessionStore.getState().userId;

    if (!localStream || !webRTCManager || !localUserId) return;

    streamStateManager.captureState(localStream);
    set({ originalStream: localStream });

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true
      } as DisplayMediaStreamOptions);

      setMainContentParticipant(localUserId);
      
      const screenVideoEl = document.createElement("video");
      const cameraVideoEl = document.createElement("video");
      const audioContext = new AudioContext();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context could not be created.");

      const screenVideoTrack = screenStream.getVideoTracks()[0];
      const { width, height } = screenVideoTrack.getSettings();
      canvas.width = width || 1920;
      canvas.height = height || 1080;

      screenVideoEl.srcObject = new MediaStream([screenVideoTrack]);
      screenVideoEl.muted = true;
      await screenVideoEl.play();

      if (includeCameraInScreenShare) {
        cameraVideoEl.srcObject = localStream;
        cameraVideoEl.muted = true;
        await cameraVideoEl.play();
      }
      
      let animationFrameId: number;
      const drawLoop = () => {
        if (!get().isSharingScreen) {
            cancelAnimationFrame(animationFrameId);
            return;
        }
        ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height);
        if (get().includeCameraInScreenShare) {
            const pipWidth = canvas.width * 0.2;
            const pipHeight = cameraVideoEl.videoHeight ? (cameraVideoEl.videoHeight / cameraVideoEl.videoWidth) * pipWidth : (pipWidth / 16) * 9;
            ctx.drawImage(cameraVideoEl, canvas.width - pipWidth - 20, canvas.height - pipHeight - 20, pipWidth, pipHeight);
        }
        animationFrameId = requestAnimationFrame(drawLoop);
      };

      const destination = audioContext.createMediaStreamDestination();
      if (screenStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(screenStream).connect(destination);
      }
      if (localStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(localStream).connect(destination);
      }
      
      const finalStream = new MediaStream([
        ...canvas.captureStream().getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);

      set({
        screenShareResources: { screenVideoEl, cameraVideoEl, audioContext, animationFrameId: null }
      });
      
      await webRTCManager.replaceLocalStream(finalStream);
      set({ isSharingScreen: true, localStream: finalStream });
      drawLoop();

      screenVideoTrack.onended = () => get().stopScreenShare();
      
      const { sendToAllPeers } = usePeerConnectionStore.getState();
      sendToAllPeers(JSON.stringify({ type: 'screen-share-state', payload: { isSharing: true } }));
      toast.success("화면 공유를 시작합니다.");

    } catch (error) {
      console.error("Screen sharing failed:", error);
      if ((error as Error).name !== 'NotAllowedError') {
        toast.error("화면 공유를 시작할 수 없습니다.");
      }
      set({ originalStream: null });
      setMainContentParticipant(null);
    }
  },

  stopScreenShare: async () => {
    const { originalStream, localStream: currentScreenStream, screenShareResources } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();
    const { setMainContentParticipant } = useUIManagementStore.getState();

    if (!originalStream || !webRTCManager) return;
    
    if (screenShareResources) {
        if (screenShareResources.animationFrameId) {
            cancelAnimationFrame(screenShareResources.animationFrameId);
        }
        if (screenShareResources.screenVideoEl) {
            screenShareResources.screenVideoEl.srcObject = null;
        }
        if (screenShareResources.cameraVideoEl) {
            screenShareResources.cameraVideoEl.srcObject = null;
        }
        if (screenShareResources.audioContext && screenShareResources.audioContext.state !== 'closed') {
            await screenShareResources.audioContext.close();
        }
        set({ screenShareResources: null });
    }
    
    currentScreenStream?.getTracks().forEach(track => track.stop());

    await webRTCManager.replaceLocalStream(originalStream);
    
    set({ isSharingScreen: false, localStream: originalStream, originalStream: null });
    setMainContentParticipant(null);

    const { sendToAllPeers } = usePeerConnectionStore.getState();
    sendToAllPeers(JSON.stringify({ type: 'screen-share-state', payload: { isSharing: false } }));
    toast.info("화면 공유가 종료되었습니다.");
  },

  setIncludeCameraInScreenShare: (include) => set({ includeCameraInScreenShare: include }),

  /**
   * 파일 스트리밍 시작 전 원본 미디어 상태 저장
   * 카메라와 마이크의 현재 상태를 스냅샷으로 저장합니다.
   */
  saveOriginalMediaState: () => {
    const state = get();
    
    console.log('[MediaDeviceStore] Saving original media state...');
    
    const originalState: OriginalMediaState = {
      stream: state.localStream,
      isAudioEnabled: state.isAudioEnabled,
      isVideoEnabled: state.isVideoEnabled,
      isSharingScreen: state.isSharingScreen,
      selectedAudioDeviceId: state.selectedAudioDeviceId,
      selectedVideoDeviceId: state.selectedVideoDeviceId
    };
    
    set({ originalMediaState: originalState });
    
    console.log('[MediaDeviceStore] Original state saved:', {
      hasStream: !!originalState.stream,
      audioEnabled: originalState.isAudioEnabled,
      videoEnabled: originalState.isVideoEnabled,
      isSharing: originalState.isSharingScreen
    });
  },

  /**
   * 파일 스트리밍 종료 후 원본 미디어 상태 복원
   * 저장된 카메라/마이크 상태로 되돌립니다.
   * 
   * @returns 복원 성공 여부
   */
  restoreOriginalMediaState: async () => {
    const { originalMediaState, localStream: currentStream } = get();
    const { webRTCManager } = usePeerConnectionStore.getState();
    
    if (!originalMediaState) {
      console.warn('[MediaDeviceStore] No original state to restore');
      return false;
    }
    
    console.log('[MediaDeviceStore] Restoring original media state...');
    
    try {
      // 파일 스트림 트랙 정리
      if (currentStream) {
        currentStream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      }
      
      // 원본 스트림 복원
      if (originalMediaState.stream && webRTCManager) {
        await webRTCManager.replaceLocalStream(originalMediaState.stream);
        
        // 트랙 활성화 상태 복원
        const videoTrack = originalMediaState.stream.getVideoTracks()[0];
        const audioTrack = originalMediaState.stream.getAudioTracks()[0];
        
        if (videoTrack) {
          videoTrack.enabled = originalMediaState.isVideoEnabled;
        }
        
        if (audioTrack) {
          audioTrack.enabled = originalMediaState.isAudioEnabled;
        }
      }
      
      // 상태 복원
      set({
        localStream: originalMediaState.stream,
        isAudioEnabled: originalMediaState.isAudioEnabled,
        isVideoEnabled: originalMediaState.isVideoEnabled,
        isSharingScreen: originalMediaState.isSharingScreen,
        selectedAudioDeviceId: originalMediaState.selectedAudioDeviceId,
        selectedVideoDeviceId: originalMediaState.selectedVideoDeviceId,
        originalMediaState: null
      });
      
      // 시그널링 업데이트
      useSignalingStore.getState().updateMediaState({ 
        kind: 'audio', 
        enabled: originalMediaState.isAudioEnabled 
      });
      useSignalingStore.getState().updateMediaState({ 
        kind: 'video', 
        enabled: originalMediaState.isVideoEnabled 
      });
      
      console.log('[MediaDeviceStore] Original state restored successfully');
      return true;
      
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to restore original state:', error);
      set({ originalMediaState: null });
      return false;
    }
  },

  /**
   * 파일 스트리밍 모드 설정
   * 
   * @param isStreaming - 파일 스트리밍 활성화 여부
   */
  setFileStreaming: (isStreaming: boolean) => {
    console.log(`[MediaDeviceStore] File streaming mode: ${isStreaming ? 'ON' : 'OFF'}`);
    set({ isFileStreaming: isStreaming });
  },

  cleanup: () => {
    deviceManager.cleanup();
    get().localStream?.getTracks().forEach(track => track.stop());
    set({
      localStream: null,
      audioInputs: [],
      videoInputs: [],
      audioOutputs: [],
      selectedAudioDeviceId: '',
      selectedVideoDeviceId: '',
      isAudioEnabled: true,
      isVideoEnabled: true,
      isSharingScreen: false,
      isChangingDevice: false,
      originalStream: null,
      includeCameraInScreenShare: true,
      screenShareResources: null,
      isFileStreaming: false,
      originalMediaState: null,
    });
  }
}));