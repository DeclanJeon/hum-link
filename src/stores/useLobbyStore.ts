import { create } from 'zustand';
import { produce } from 'immer';
import { mediaCapabilityDetector, MediaCapabilities } from '@/lib/mediaCapabilityDetector';
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
  // 새로 추가
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
  setSelectedAudioDevice: (deviceId: string) => void;
  setSelectedVideoDevice: (deviceId: string) => void;
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
  selectedAudioDevice: null,
  selectedVideoDevice: null,
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

  initializeMedia: async (toast: any) => {
    try {
      // 먼저 디바이스 능력 감지
      const capabilities = await mediaCapabilityDetector.detectCapabilities();
      set({ mediaCapabilities: capabilities });

      // 선호 설정 (localStorage에서 가져오기)
      const preferredAudioDevice = localStorage.getItem("preferredAudioDevice");
      const preferredVideoDevice = localStorage.getItem("preferredVideoDevice");

      // 제약 조건 생성
      const constraints: MediaStreamConstraints = {
        audio: preferredAudioDevice ? 
          { deviceId: { exact: preferredAudioDevice } } : 
          true,
        video: preferredVideoDevice ? 
          { deviceId: { exact: preferredVideoDevice } } : 
          { width: { ideal: 1280 }, height: { ideal: 720 } }
      };

      // 능력에 따른 스트림 생성
      const result = await mediaCapabilityDetector.getConstrainedStream(constraints, true);
      
      set({ 
        stream: result.stream,
        isDummyStream: result.isDummy,
        streamWarnings: result.warnings,
        audioDevices: result.capabilities.microphones,
        videoDevices: result.capabilities.cameras
      });

      // 실제 디바이스가 있는 경우 선택된 디바이스 설정
      // if (result.capabilities.microphones.length > 0 && !get().selectedAudioDevice) {
      //   set({ selectedAudioDevice: result.capabilities.microphones[0].deviceId });
      // }
      // if (result.capabilities.cameras.length > 0 && !get().selectedVideoDevice) {
      //   set({ selectedVideoDevice: result.capabilities.cameras[0].deviceId });
      // }

          // 실제 디바이스가 있는 경우 선택된 디바이스 설정
      if (result.capabilities.microphones.length > 0) {
        // deviceId가 빈 문자열이 아닌지 확인!
        const validMic = result.capabilities.microphones.find(
          mic => mic.deviceId && mic.deviceId !== ""
        );
        if (validMic) {
          set({ selectedAudioDevice: validMic.deviceId });
        }
      }
      
      if (result.capabilities.cameras.length > 0) {
        // 카메라도 동일하게 처리
        const validCam = result.capabilities.cameras.find(
          cam => cam.deviceId && cam.deviceId !== ""
        );
        if (validCam) {
          set({ selectedVideoDevice: validCam.deviceId });
        }
      }

      // 오디오 분석 초기화 (마이크가 있는 경우만)
      if (result.capabilities.hasMicrophone && get().isAudioEnabled) {
        get().initializeAudioAnalysis(result.stream);
      }

      // 상태에 따른 메시지
      if (result.isDummy) {
        toast.info("No camera or microphone detected. You can still join and receive streams.");
      } else if (result.warnings.length > 0) {
        toast.warning(`Limited access: ${result.warnings.join(', ')}`);
      } else {
        toast.success("Camera and microphone ready!");
      }
      
    } catch (error) {
      console.error("Media initialization error:", error);
      
      // 완전 실패 시 더미 스트림 생성
      const dummyResult = await mediaCapabilityDetector.getConstrainedStream(
        { audio: true, video: true },
        false
      );
      
      set({ 
        stream: dummyResult.stream,
        isDummyStream: true,
        streamWarnings: ['Failed to access media devices']
      });
      
      toast.error("Could not access media devices. You can still join in receive-only mode.");
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
    
    // 마이크가 없으면 토글 불가
    if (!mediaCapabilities?.hasMicrophone) {
      return;
    }
    
    const newState = !isAudioEnabled;
    set({ isAudioEnabled: newState });
    stream?.getAudioTracks().forEach(track => { track.enabled = newState; });
  },

  toggleVideo: async (toast: any) => {
    const { isVideoEnabled, stream, mediaCapabilities } = get();
    
    // 카메라가 없으면 토글 불가
    if (!mediaCapabilities?.hasCamera) {
      toast.warning("No camera available");
      return;
    }
    
    const newVideoState = !isVideoEnabled;
    set({ isVideoEnabled: newVideoState });
    stream?.getVideoTracks().forEach(track => { track.enabled = newVideoState; });
  },

  setSelectedAudioDevice: (deviceId: string) => {
    set({ selectedAudioDevice: deviceId });
    localStorage.setItem("preferredAudioDevice", deviceId);
  },
  
  setSelectedVideoDevice: (deviceId: string) => {
    set({ selectedVideoDevice: deviceId });
    localStorage.setItem("preferredVideoDevice", deviceId);
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
