/**
 * @fileoverview 로비 상태 관리 Store
 * @module stores/useLobbyStore
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { mediaCapabilityDetector, MediaCapabilities } from '@/lib/mediaCapabilityDetector';
import { useMediaDeviceStore } from './useMediaDeviceStore';
import nicknamesData from '@/data/nicknames.json';

interface ConnectionDetails {
  roomTitle: string;
  nickname: string;
}

interface LobbyState {
  connectionDetails: ConnectionDetails | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  audioLevel: number;
  selectedAudioDevice: string;
  selectedVideoDevice: string;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  mediaCapabilities: MediaCapabilities | null;
  isDummyStream: boolean;
  streamWarnings: string[];
  deviceChangeHandler?: (ev: Event) => void;
  animationFrameId?: number;
}

interface LobbyActions {
  initialize: (roomTitle: string, nickname: string, navigate: (path: string) => void, toast: any) => Promise<void>;
  initializeMedia: (toast: any) => Promise<void>;
  initializeAudioAnalysis: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: (toast: any) => Promise<void>;
  setSelectedAudioDevice: (deviceId: string, toast: any) => Promise<void>;
  setSelectedVideoDevice: (deviceId: string, toast: any) => Promise<void>;
  setAudioLevel: (level: number) => void;
  refreshDevices: () => Promise<void>;
  cleanup: () => void;
}

/**
 * 랜덤 닉네임 생성
 */
const generateRandomNickname = () => {
  const { adjectives, animals } = nicknamesData;
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
  return `${randomAdjective} ${randomAnimal}`;
};

export const useLobbyStore = create<LobbyState & LobbyActions>((set, get) => ({
  connectionDetails: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  audioLevel: 0,
  selectedAudioDevice: '',
  selectedVideoDevice: '',
  stream: null,
  audioContext: null,
  analyser: null,
  audioDevices: [],
  videoDevices: [],
  mediaCapabilities: null,
  isDummyStream: false,
  streamWarnings: [],
  deviceChangeHandler: undefined,
  animationFrameId: undefined,

  /**
   * 로비 초기화
   */
  initialize: async (roomTitle, nickname, navigate, toast) => {
    const finalNickname = nickname || generateRandomNickname();
    set({ connectionDetails: { roomTitle: decodeURIComponent(roomTitle), nickname: finalNickname } });
    await get().initializeMedia(toast);
  },

  /**
   * 미디어 초기화 (개선된 버전)
   * - 권한 요청 실패 시에도 디바이스 목록 표시
   * - 스트림 획득 후 디바이스 목록 갱신 보장
   */
  initializeMedia: async (toast: any) => {
    try {
      console.log('[Lobby] Starting media initialization...');
      
      // 1. 미디어 capability 감지
      const capabilities = await mediaCapabilityDetector.detectCapabilities();
      set({ mediaCapabilities: capabilities });

      // 2. 선호 디바이스 ID 로드 (localStorage)
      const preferredAudioDevice = localStorage.getItem("preferredAudioDevice") || "";
      const preferredVideoDevice = localStorage.getItem("preferredVideoDevice") || "";

      console.log('[Lobby] Preferred devices:', { 
        audio: preferredAudioDevice.substring(0, 8), 
        video: preferredVideoDevice.substring(0, 8)
      });

      // 3. Constraints 구성
      const constraints: MediaStreamConstraints = {
        audio: preferredAudioDevice
          ? { deviceId: { exact: preferredAudioDevice } }
          : true,
        video: preferredVideoDevice
          ? {
              deviceId: { exact: preferredVideoDevice },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          : { width: { ideal: 1280 }, height: { ideal: 720 } }
      };

      // 4. 스트림 획득 (선호 디바이스 실패 시 기본 디바이스로 재시도)
      let result;
      try {
        result = await mediaCapabilityDetector.getConstrainedStream(constraints, true);
      } catch (error) {
        console.warn('[Lobby] Preferred device failed, trying default:', error);
        
        // Fallback: 기본 디바이스로 재시도
        result = await mediaCapabilityDetector.getConstrainedStream(
          { audio: true, video: true },
          true
        );
      }
      
      console.log('[Lobby] Stream obtained:', {
        isDummy: result.isDummy,
        warnings: result.warnings,
        videoTracks: result.stream.getVideoTracks().length,
        audioTracks: result.stream.getAudioTracks().length,
        streamId: result.stream.id
      });

      // 5. 스트림 주입: MediaDeviceStore로 전달
      const mediaDeviceStore = useMediaDeviceStore.getState();
      mediaDeviceStore.setLocalStream(result.stream);
      
      console.log('[Lobby] Stream injected to MediaDeviceStore');

      // 6. Lobby 상태 업데이트
      set({
        stream: result.stream,
        isDummyStream: result.isDummy,
        streamWarnings: result.warnings,
      });

      // 7. 디바이스 목록 갱신 (권한 획득 후 대기 시간 추가)
      await new Promise(resolve => setTimeout(resolve, 100)); // 권한 적용 대기
      await get().refreshDevices();
      
      console.log('[Lobby] Devices refreshed after stream acquisition');

      // 8. devicechange 이벤트 리스너 등록 (중복 방지)
      const existingHandler = get().deviceChangeHandler;
      if (existingHandler) {
        navigator.mediaDevices.removeEventListener('devicechange', existingHandler);
        console.log('[Lobby] Removed existing device change listener');
      }
      
      const handler = () => {
        console.log('[Lobby] Device change detected, refreshing...');
        get().refreshDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', handler);
      set({ deviceChangeHandler: handler });
      
      console.log('[Lobby] Device change listener registered');

      // 9. 오디오 분석 초기화 (마이크가 있고 활성화된 경우)
      if (result.capabilities.hasMicrophone && get().isAudioEnabled) {
        get().initializeAudioAnalysis(result.stream);
        console.log('[Lobby] Audio analysis initialized');
      }

      // 10. 사용자 피드백
      if (result.isDummy) {
        toast.info("카메라/마이크를 사용할 수 없습니다. 수신 전용 모드입니다.");
      } else if (result.warnings.length > 0) {
        toast.warning(`주의: ${result.warnings.join(', ')}`);
      } else {
        toast.success("준비 완료!");
      }
      
    } catch (error) {
      console.error("[Lobby] Media initialization error:", error);
      
      // Fallback: 더미 스트림 생성 (권한 없어도 진행)
      try {
        const dummyResult = await mediaCapabilityDetector.getConstrainedStream(
          { audio: true, video: true },
          false
        );
        
        useMediaDeviceStore.getState().setLocalStream(dummyResult.stream);
        
        set({
          stream: dummyResult.stream,
          isDummyStream: true,
          streamWarnings: ['디바이스 접근 권한이 필요합니다.']
        });
        
        // 더미 스트림이라도 디바이스 목록은 표시 (레이블 없음)
        await get().refreshDevices();
        
        toast.error("미디어 접근 실패. 수신 전용 모드입니다.");
      } catch (fallbackError) {
        console.error("[Lobby] Fallback also failed:", fallbackError);
        toast.error("미디어 초기화 실패.");
      }
    }
  },

  /**
   * 디바이스 목록 갱신 (개선된 버전)
   * - 현재 사용 중인 디바이스 ID를 우선 선택
   * - 권한이 없어도 디바이스 목록은 표시 (레이블 없음)
   */
  refreshDevices: async () => {
    try {
      console.log('[Lobby] Refreshing device list...');
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      console.log('[Lobby] Enumerated devices:', {
        total: devices.length,
        audio: devices.filter(d => d.kind === 'audioinput').length,
        video: devices.filter(d => d.kind === 'videoinput').length
      });

      // default 디바이스 제외 (중복 방지)
      const audioDevices = devices.filter(
        d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default'
      );
      const videoDevices = devices.filter(
        d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== 'default'
      );

      console.log('[Lobby] Filtered devices:', {
        audio: audioDevices.map(d => ({ id: d.deviceId.substring(0, 8), label: d.label })),
        video: videoDevices.map(d => ({ id: d.deviceId.substring(0, 8), label: d.label }))
      });

      // 현재 사용 중인 디바이스 ID 가져오기
      const stream = get().stream || useMediaDeviceStore.getState().localStream;
      const currentAudioId = stream?.getAudioTracks()[0]?.getSettings().deviceId || '';
      const currentVideoId = stream?.getVideoTracks()[0]?.getSettings().deviceId || '';

      console.log('[Lobby] Current active devices:', {
        audio: currentAudioId.substring(0, 8),
        video: currentVideoId.substring(0, 8)
      });

      // 선택된 디바이스 ID 결정 (우선순위: 현재 사용 중 > 기존 선택 > 첫 번째 디바이스)
      const finalAudioId = currentAudioId || get().selectedAudioDevice || (audioDevices[0]?.deviceId ?? '');
      const finalVideoId = currentVideoId || get().selectedVideoDevice || (videoDevices[0]?.deviceId ?? '');

      set({
        audioDevices,
        videoDevices,
        selectedAudioDevice: finalAudioId,
        selectedVideoDevice: finalVideoId,
      });
      
      console.log('[Lobby] Device refresh complete:', {
        selectedAudio: finalAudioId.substring(0, 8),
        selectedVideo: finalVideoId.substring(0, 8),
        audioCount: audioDevices.length,
        videoCount: videoDevices.length
      });
      
    } catch (error) {
      console.warn('[Lobby] refreshDevices failed:', error);
    }
  },

  /**
   * 오디오 분석 초기화
   */
  initializeAudioAnalysis: (stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[Lobby] No audio tracks to analyze');
      return;
    }

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      set({ audioContext, analyser });
      
      const updateAudioLevel = () => {
        const currentAnalyser = get().analyser;
        if (currentAnalyser) {
          const dataArray = new Uint8Array(currentAnalyser.frequencyBinCount);
          currentAnalyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          set({ audioLevel: average / 255 });
          
          const frameId = requestAnimationFrame(updateAudioLevel);
          set({ animationFrameId: frameId });
        }
      };
      
      updateAudioLevel();
      console.log('[Lobby] Audio analysis started');
    } catch (error) {
      console.error('[Lobby] Failed to initialize audio analysis:', error);
    }
  },

  /**
   * 오디오 토글
   */
  toggleAudio: () => {
    const { isAudioEnabled, stream, mediaCapabilities } = get();
    
    if (!mediaCapabilities?.hasMicrophone) {
      console.warn('[Lobby] No microphone available');
      return;
    }
    
    const newState = !isAudioEnabled;
    set({ isAudioEnabled: newState });
    
    stream?.getAudioTracks().forEach(track => { 
      track.enabled = newState;
    });
    
    console.log('[Lobby] Audio toggled:', newState);
  },

  /**
   * 비디오 토글
   */
  toggleVideo: async (toast: any) => {
    const { isVideoEnabled, stream, mediaCapabilities } = get();
    
    if (!mediaCapabilities?.hasCamera) {
      toast.warning("카메라가 없습니다");
      return;
    }
    
    const newVideoState = !isVideoEnabled;
    set({ isVideoEnabled: newVideoState });
    
    stream?.getVideoTracks().forEach(track => { 
      track.enabled = newVideoState;
    });
    
    console.log('[Lobby] Video toggled:', newVideoState);
  },

  /**
   * 오디오 디바이스 변경 (MediaDeviceStore 사용)
   */
  setSelectedAudioDevice: async (deviceId: string, toast: any) => {
    console.log('[Lobby] Changing audio device to:', deviceId.substring(0, 8));
    
    const { changeAudioDevice } = useMediaDeviceStore.getState();
    const success = await changeAudioDevice(deviceId);
    
    if (success) {
      set({ selectedAudioDevice: deviceId });
      
      const { audioDevices } = get();
      const device = audioDevices.find(d => d.deviceId === deviceId);
      toast.success(`마이크를 "${device?.label || deviceId}"(으)로 변경했습니다`);
      
      console.log('[Lobby] Audio device changed successfully');
    } else {
      console.error('[Lobby] Audio device change failed');
    }
  },
  
  /**
   * 비디오 디바이스 변경 (MediaDeviceStore 사용)
   */
  setSelectedVideoDevice: async (deviceId: string, toast: any) => {
    console.log('[Lobby] Changing video device to:', deviceId.substring(0, 8));
    
    const { changeVideoDevice } = useMediaDeviceStore.getState();
    const success = await changeVideoDevice(deviceId);
    
    if (success) {
      set({ selectedVideoDevice: deviceId });
      
      const { videoDevices } = get();
      const device = videoDevices.find(d => d.deviceId === deviceId);
      toast.success(`카메라를 "${device?.label || deviceId}"(으)로 변경했습니다`);
      
      console.log('[Lobby] Video device changed successfully');
    } else {
      console.error('[Lobby] Video device change failed');
    }
  },
  
  /**
   * 오디오 레벨 설정
   */
  setAudioLevel: (level: number) => set({ audioLevel: level }),

  /**
   * 정리 (cleanup)
   */
  cleanup: () => {
    console.log('[Lobby] Cleaning up...');
    
    const { stream, audioContext, deviceChangeHandler, animationFrameId } = get();
    
    // 스트림 정지
    stream?.getTracks().forEach(track => {
      track.stop();
      console.log('[Lobby] Stopped track:', track.kind, track.label);
    });
    
    // 오디오 컨텍스트 닫기
    audioContext?.close();
    
    // 이벤트 리스너 제거
    if (deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', deviceChangeHandler);
      console.log('[Lobby] Device change listener removed');
    }
    
    // 애니메이션 프레임 취소
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
      console.log('[Lobby] Animation frame cancelled');
    }
    
    // MediaCapabilityDetector 정리
    mediaCapabilityDetector.cleanup();
    
    set({
      connectionDetails: null,
      stream: null,
      audioContext: null,
      analyser: null,
      audioLevel: 0,
      audioDevices: [],
      videoDevices: [],
      mediaCapabilities: null,
      isDummyStream: false,
      streamWarnings: [],
      deviceChangeHandler: undefined,
      animationFrameId: undefined,
    });
    
    console.log('[Lobby] Cleanup complete');
  }
}));