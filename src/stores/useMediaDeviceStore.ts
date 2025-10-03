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
    });
  }
}));
