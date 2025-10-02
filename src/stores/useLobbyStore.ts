// frontend/src/stores/useLobbyStore.ts
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

  initialize: async (roomTitle, nickname, navigate, toast) => {
    const finalNickname = nickname || generateRandomNickname();
    set({ connectionDetails: { roomTitle: decodeURIComponent(roomTitle), nickname: finalNickname } });
    await get().initializeMedia(toast);
  },

  /**
   * 미디어 초기화 - 단일 소스 원칙 적용
   */
  initializeMedia: async (toast: any) => {
    try {
      console.log('[Lobby] Starting media initialization...');
      
      // 1. 먼저 capability 감지
      const capabilities = await mediaCapabilityDetector.detectCapabilities();
      set({ mediaCapabilities: capabilities });

      // 2. 선호 장치 ID 가져오기 (localStorage)
      const preferredAudioDevice = localStorage.getItem("preferredAudioDevice") || "";
      const preferredVideoDevice = localStorage.getItem("preferredVideoDevice") || "";

      console.log('[Lobby] Preferred devices:', { 
        audio: preferredAudioDevice, 
        video: preferredVideoDevice 
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

      // 4. 스트림 획득 (권한 요청 포함)
      const result = await mediaCapabilityDetector.getConstrainedStream(constraints, true);
      
      console.log('[Lobby] Stream obtained:', {
        isDummy: result.isDummy,
        warnings: result.warnings,
        videoTracks: result.stream.getVideoTracks().length,
        audioTracks: result.stream.getAudioTracks().length
      });

      // 5. 단일 소스: MediaDeviceStore에 동일 스트림 주입
      const mediaDeviceStore = useMediaDeviceStore.getState();
      mediaDeviceStore.setLocalStream(result.stream);
      
      console.log('[Lobby] Stream injected to MediaDeviceStore');

      // 6. Lobby도 같은 객체 참조
      set({
        stream: result.stream,
        isDummyStream: result.isDummy,
        streamWarnings: result.warnings,
      });

      // 7. 권한 부여 이후 재-열거 및 선택 장치 동기화
      await get().refreshDevices();
      
      console.log('[Lobby] Devices refreshed after stream acquisition');

      // 8. devicechange 리스너 등록
      const handler = () => {
        console.log('[Lobby] Device change detected, refreshing...');
        get().refreshDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', handler);
      set({ deviceChangeHandler: handler });
      
      console.log('[Lobby] Device change listener registered');

      // 9. 오디오 레벨 분석 초기화 (마이크 있을 때만)
      if (result.capabilities.hasMicrophone && get().isAudioEnabled) {
        get().initializeAudioAnalysis(result.stream);
        console.log('[Lobby] Audio analysis initialized');
      }

      // 10. 사용자 피드백
      if (result.isDummy) {
        toast.info("실제 장치를 찾지 못했습니다. 더미 스트림을 사용합니다.");
      } else if (result.warnings.length > 0) {
        toast.warning(`경고: ${result.warnings.join(', ')}`);
      } else {
        toast.success("미디어 준비 완료!");
      }
      
    } catch (error) {
      console.error("[Lobby] Media initialization error:", error);
      
      // Fallback: 더미 스트림
      try {
        const dummyResult = await mediaCapabilityDetector.getConstrainedStream(
          { audio: true, video: true },
          false
        );
        
        useMediaDeviceStore.getState().setLocalStream(dummyResult.stream);
        
        set({
          stream: dummyResult.stream,
          isDummyStream: true,
          streamWarnings: ['실제 장치를 사용할 수 없어 더미 스트림을 사용합니다.']
        });
        
        toast.error("장치를 초기화하지 못했습니다. 더미 스트림으로 진행합니다.");
      } catch (fallbackError) {
        console.error("[Lobby] Fallback also failed:", fallbackError);
        toast.error("미디어 초기화에 완전히 실패했습니다.");
      }
    }
  },

  /**
   * 권한 부여 후/디바이스 변경 시 재-열거
   * - 라벨/ID 정상화
   * - 선택 장치 ID를 실제 트랙과 동기화
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

      // default 제외하고 실제 장치만 필터링
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

      // 현재 활성 트랙에서 실제 선택된 디바이스 ID 가져오기
      const stream = get().stream || useMediaDeviceStore.getState().localStream;
      const currentAudioId = stream?.getAudioTracks()[0]?.getSettings().deviceId || '';
      const currentVideoId = stream?.getVideoTracks()[0]?.getSettings().deviceId || '';

      console.log('[Lobby] Current active devices:', {
        audio: currentAudioId.substring(0, 8),
        video: currentVideoId.substring(0, 8)
      });

      // 선택된 장치 ID 설정 (우선순위: 실제 트랙 > 기존 선택 > 첫 번째 장치)
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
        selectedVideo: finalVideoId.substring(0, 8)
      });
      
    } catch (error) {
      console.warn('[Lobby] refreshDevices failed:', error);
    }
  },

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
        }
        requestAnimationFrame(updateAudioLevel);
      };
      
      updateAudioLevel();
      console.log('[Lobby] Audio analysis started');
    } catch (error) {
      console.error('[Lobby] Failed to initialize audio analysis:', error);
    }
  },

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

  toggleVideo: async (toast: any) => {
    const { isVideoEnabled, stream, mediaCapabilities } = get();
    
    if (!mediaCapabilities?.hasCamera) {
      toast.warning("카메라를 사용할 수 없습니다");
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
   * 오디오 장치 변경 (MediaDeviceStore 통합)
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
   * 비디오 장치 변경 (MediaDeviceStore 통합)
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
  
  setAudioLevel: (level: number) => set({ audioLevel: level }),

  cleanup: () => {
    console.log('[Lobby] Cleaning up...');
    
    const { stream, audioContext, deviceChangeHandler } = get();
    
    // 스트림 정리
    stream?.getTracks().forEach(track => {
      track.stop();
      console.log('[Lobby] Stopped track:', track.kind, track.label);
    });
    
    // 오디오 컨텍스트 정리
    audioContext?.close();
    
    // 이벤트 리스너 제거
    if (deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', deviceChangeHandler);
      console.log('[Lobby] Device change listener removed');
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
    });
    
    console.log('[Lobby] Cleanup complete');
  }
}));
