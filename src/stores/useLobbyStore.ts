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
  // 미디어 기능
  mediaCapabilities: MediaCapabilities | null;
  isDummyStream: boolean;
  streamWarnings: string[];
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

  initialize: async (roomTitle, nickname, navigate, toast) => {
    const finalNickname = nickname || generateRandomNickname();
    set({ connectionDetails: { roomTitle: decodeURIComponent(roomTitle), nickname: finalNickname } });
    await get().initializeMedia(toast);
  },

  /**
   * 미디어 초기화
   */
  initializeMedia: async (toast: any) => {
    try {
      // 먼저 capability 검사
      const capabilities = await mediaCapabilityDetector.detectCapabilities();
      set({ mediaCapabilities: capabilities });

      // 선호하는 디바이스 ID 가져오기 (localStorage)
      const preferredAudioDevice = localStorage.getItem("preferredAudioDevice");
      const preferredVideoDevice = localStorage.getItem("preferredVideoDevice");

      // 유효한 디바이스만 필터링
      const validAudioDevices = capabilities.microphones.filter(
        d => d.deviceId && d.deviceId !== "" && d.deviceId !== "default"
      );
      const validVideoDevices = capabilities.cameras.filter(
        d => d.deviceId && d.deviceId !== "" && d.deviceId !== "default"
      );

      // 선택된 디바이스 결정
      let selectedAudioId = preferredAudioDevice;
      let selectedVideoId = preferredVideoDevice;

      // 선호 디바이스가 없거나 유효하지 않으면 첫 번째 디바이스 사용
      if (!selectedAudioId || !validAudioDevices.find(d => d.deviceId === selectedAudioId)) {
        selectedAudioId = validAudioDevices[0]?.deviceId || "";
      }
      
      if (!selectedVideoId || !validVideoDevices.find(d => d.deviceId === selectedVideoId)) {
        selectedVideoId = validVideoDevices[0]?.deviceId || "";
      }

      // Constraints 생성
      const constraints: MediaStreamConstraints = {
        audio: selectedAudioId ?
          { deviceId: { exact: selectedAudioId } } :
          true,
        video: selectedVideoId ?
          {
            deviceId: { exact: selectedVideoId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } :
          { width: { ideal: 1280 }, height: { ideal: 720 } }
      };

      // 스트림 생성
      const result = await mediaCapabilityDetector.getConstrainedStream(constraints, true);
      
      set({
        stream: result.stream,
        isDummyStream: result.isDummy,
        streamWarnings: result.warnings,
        audioDevices: validAudioDevices,
        videoDevices: validVideoDevices,
        selectedAudioDevice: selectedAudioId,
        selectedVideoDevice: selectedVideoId
      });

      // 오디오 분석 초기화
      if (result.capabilities.hasMicrophone && get().isAudioEnabled) {
        get().initializeAudioAnalysis(result.stream);
      }

      // 토스트 메시지
      if (result.isDummy) {
        toast.info("카메라와 마이크를 사용할 수 없습니다. 수신 전용 모드로 진행합니다.");
      } else if (result.warnings.length > 0) {
        toast.warning(`주의: ${result.warnings.join(', ')}`);
      } else {
        toast.success("미디어 준비 완료!");
      }
      
    } catch (error) {
      console.error("Media initialization error:", error);
      
      // Fallback: Dummy stream
      const dummyResult = await mediaCapabilityDetector.getConstrainedStream(
        { audio: true, video: true },
        false
      );
      
      set({
        stream: dummyResult.stream,
        isDummyStream: true,
        streamWarnings: ['카메라와 마이크를 사용할 수 없습니다']
      });
      
      toast.error("미디어 장치에 접근할 수 없습니다. 수신 전용 모드로 진행합니다.");
    }
  },

  initializeAudioAnalysis: (stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[Lobby] No audio tracks to analyze');
      return;
    }

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
  },

  toggleAudio: () => {
    const { isAudioEnabled, stream, mediaCapabilities } = get();
    
    // 마이크가 없으면 무시
    if (!mediaCapabilities?.hasMicrophone) {
      return;
    }
    
    const newState = !isAudioEnabled;
    set({ isAudioEnabled: newState });
    stream?.getAudioTracks().forEach(track => { track.enabled = newState; });
  },

  toggleVideo: async (toast: any) => {
    const { isVideoEnabled, stream, mediaCapabilities } = get();
    
    // 카메라가 없으면 경고
    if (!mediaCapabilities?.hasCamera) {
      toast.warning("No camera available");
      return;
    }
    
    const newVideoState = !isVideoEnabled;
    set({ isVideoEnabled: newVideoState });
    stream?.getVideoTracks().forEach(track => { track.enabled = newVideoState; });
  },

  /**
   * 오디오 디바이스 변경 (MediaDeviceStore로 위임)
   */
  setSelectedAudioDevice: async (deviceId: string, toast: any) => {
    const { changeAudioDevice } = useMediaDeviceStore.getState();
    const success = await changeAudioDevice(deviceId);
    
    if (success) {
      set({ selectedAudioDevice: deviceId });
      
      const { audioDevices } = get();
      const device = audioDevices.find(d => d.deviceId === deviceId);
      toast.success(`마이크가 "${device?.label}"로 변경되었습니다`);
    }
  },
  
  /**
   * 비디오 디바이스 변경 (MediaDeviceStore로 위임)
   */
  setSelectedVideoDevice: async (deviceId: string, toast: any) => {
    const { changeVideoDevice } = useMediaDeviceStore.getState();
    const success = await changeVideoDevice(deviceId);
    
    if (success) {
      set({ selectedVideoDevice: deviceId });
      
      const { videoDevices } = get();
      const device = videoDevices.find(d => d.deviceId === deviceId);
      toast.success(`카메라가 "${device?.label}"로 변경되었습니다`);
    }
  },
  
  setAudioLevel: (level: number) => set({ audioLevel: level }),

  cleanup: () => {
    const { stream, audioContext } = get();
    stream?.getTracks().forEach(track => track.stop());
    audioContext?.close();
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
      streamWarnings: []
    });
  }
}));
