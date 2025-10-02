/**
 * @fileoverview 미디어 디바이스 상태 관리 (재설계)
 * @module stores/useMediaDeviceStore
 */

import { create } from 'zustand';
import { deviceManager } from '@/services/deviceManager';
import { DeviceInfo } from '@/lib/deviceUtils';
import { usePeerConnectionStore } from './usePeerConnectionStore';
import { useSignalingStore } from './useSignalingStore';
import { toast } from 'sonner';

interface MediaDeviceState {
  // 스트림
  localStream: MediaStream | null;
  
  // 디바이스 목록
  audioInputs: DeviceInfo[];
  videoInputs: DeviceInfo[];
  audioOutputs: DeviceInfo[];
  
  // 선택된 디바이스
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  
  // 활성화 상태
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  
  // 화면 공유
  isSharingScreen: boolean;
  
  // 모바일
  isMobile: boolean;
  
  // 로딩 상태
  isChangingDevice: boolean;
}

interface MediaDeviceActions {
  // 초기화
  initialize: () => Promise<void>;
  
  // 디바이스 변경
  changeAudioDevice: (deviceId: string) => Promise<void>;
  changeVideoDevice: (deviceId: string) => Promise<void>;
  switchCamera: () => Promise<void>;
  
  // 토글
  toggleAudio: () => void;
  toggleVideo: () => void;
  
  // 정리
  cleanup: () => void;
}

export const useMediaDeviceStore = create<MediaDeviceState & MediaDeviceActions>((set, get) => ({
  // 초기 상태
  localStream: null,
  audioInputs: [],
  videoInputs: [],
  audioOutputs: [],
  selectedAudioDeviceId: '',
  selectedVideoDeviceId: '',
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,
  isMobile: false,
  isChangingDevice: false,

  /**
   * 초기화
   */
  initialize: async () => {
    console.log('[MediaDeviceStore] Initializing...');

    try {
      // DeviceManager 초기화
      await deviceManager.initialize();

      // 상태 동기화
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
        isMobile: deviceManager['isMobile']
      });

      // 디바이스 변경 리스너 등록
      deviceManager.onDeviceChange(() => {
        const updatedDevices = deviceManager.getDevices();
        set({
          audioInputs: updatedDevices.audioInputs,
          videoInputs: updatedDevices.videoInputs,
          audioOutputs: updatedDevices.audioOutputs
        });
      });

      console.log('[MediaDeviceStore] Initialized successfully');
    } catch (error) {
      console.error('[MediaDeviceStore] Initialization failed:', error);
      toast.error('디바이스 초기화에 실패했습니다.');
    }
  },

  /**
   * 오디오 디바이스 변경
   */
  changeAudioDevice: async (deviceId: string) => {
    if (get().isChangingDevice) {
      console.warn('[MediaDeviceStore] Device change already in progress');
      return;
    }

    set({ isChangingDevice: true });

    try {
      console.log('[MediaDeviceStore] Changing audio device...');

      // 1. 새 스트림 생성
      const newStream = await deviceManager.changeAudioDevice(deviceId);

      // 2. WebRTC 피어에 스트림 교체
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        const success = await webRTCManager.replaceLocalStream(newStream);
        
        if (!success) {
          throw new Error('Failed to replace stream in WebRTC peers');
        }
      }

      // 3. 상태 업데이트
      set({
        localStream: newStream,
        selectedAudioDeviceId: deviceId
      });

      // 4. Signaling 서버에 상태 전송
      useSignalingStore.getState().updateMediaState({
        kind: 'audio',
        enabled: get().isAudioEnabled
      });

      toast.success('오디오 디바이스가 변경되었습니다.');
      console.log('[MediaDeviceStore] Audio device changed successfully');
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to change audio device:', error);
      toast.error('오디오 디바이스 변경에 실패했습니다.');
    } finally {
      set({ isChangingDevice: false });
    }
  },

  /**
   * 비디오 디바이스 변경
   */
  changeVideoDevice: async (deviceId: string) => {
    if (get().isChangingDevice) {
      console.warn('[MediaDeviceStore] Device change already in progress');
      return;
    }

    set({ isChangingDevice: true });

    try {
      console.log('[MediaDeviceStore] Changing video device...');

      // 1. 새 스트림 생성
      const newStream = await deviceManager.changeVideoDevice(deviceId);

      // 2. WebRTC 피어에 스트림 교체
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        const success = await webRTCManager.replaceLocalStream(newStream);
        
        if (!success) {
          throw new Error('Failed to replace stream in WebRTC peers');
        }
      }

      // 3. 상태 업데이트
      set({
        localStream: newStream,
        selectedVideoDeviceId: deviceId
      });

      // 4. Signaling 서버에 상태 전송
      useSignalingStore.getState().updateMediaState({
        kind: 'video',
        enabled: get().isVideoEnabled
      });

      toast.success('비디오 디바이스가 변경되었습니다.');
      console.log('[MediaDeviceStore] Video device changed successfully');
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to change video device:', error);
      toast.error('비디오 디바이스 변경에 실패했습니다.');
    } finally {
      set({ isChangingDevice: false });
    }
  },

  /**
   * 카메라 전환 (모바일)
   */
  switchCamera: async () => {
    if (!get().isMobile) {
      toast.warning('카메라 전환은 모바일에서만 사용 가능합니다.');
      return;
    }

    if (get().isChangingDevice) {
      console.warn('[MediaDeviceStore] Device change already in progress');
      return;
    }

    set({ isChangingDevice: true });

    try {
      console.log('[MediaDeviceStore] Switching camera...');

      // 1. 카메라 전환
      const newStream = await deviceManager.switchCamera();

      // 2. WebRTC 피어에 스트림 교체
      const { webRTCManager } = usePeerConnectionStore.getState();
      if (webRTCManager) {
        const success = await webRTCManager.replaceLocalStream(newStream);
        
        if (!success) {
          throw new Error('Failed to replace stream in WebRTC peers');
        }
      }

      // 3. 상태 업데이트
      const selected = deviceManager.getSelectedDevices();
      set({
        localStream: newStream,
        selectedVideoDeviceId: selected.videoDeviceId
      });

      toast.success('카메라가 전환되었습니다.', { duration: 1500 });
      console.log('[MediaDeviceStore] Camera switched successfully');
    } catch (error) {
      console.error('[MediaDeviceStore] Failed to switch camera:', error);
      toast.error('카메라 전환에 실패했습니다.');
    } finally {
      set({ isChangingDevice: false });
    }
  },

  /**
   * 오디오 토글
   */
  toggleAudio: () => {
    const { localStream, isAudioEnabled } = get();
    const newState = !isAudioEnabled;

    localStream?.getAudioTracks().forEach(track => {
      track.enabled = newState;
    });

    set({ isAudioEnabled: newState });

    useSignalingStore.getState().updateMediaState({
      kind: 'audio',
      enabled: newState
    });

    console.log('[MediaDeviceStore] Audio toggled:', newState);
  },

  /**
   * 비디오 토글
   */
  toggleVideo: () => {
    const { localStream, isVideoEnabled } = get();
    const newState = !isVideoEnabled;

    localStream?.getVideoTracks().forEach(track => {
      track.enabled = newState;
    });

    set({ isVideoEnabled: newState });

    useSignalingStore.getState().updateMediaState({
      kind: 'video',
      enabled: newState
    });

    console.log('[MediaDeviceStore] Video toggled:', newState);
  },

  /**
   * 정리
   */
  cleanup: () => {
    deviceManager.cleanup();
    
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
      isChangingDevice: false
    });

    console.log('[MediaDeviceStore] Cleaned up');
  }
}));
