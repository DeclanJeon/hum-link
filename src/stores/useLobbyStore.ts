import { create } from 'zustand';
import { produce } from 'immer';

interface ConnectionDetails {
  roomTitle: string;
  nickname: string;
}

// 변경점: 장치 목록 상태 추가
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
  audioDevices: MediaDeviceInfo[]; // 오디오 장치 목록
  videoDevices: MediaDeviceInfo[]; // 비디오 장치 목록
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
  const adjectives = ["Brilliant", "Curious", "Radiant", "Wandering", "Inspiring", "Creative", "Thoughtful", "Dynamic"];
  const nouns = ["Explorer", "Innovator", "Dreamer", "Architect", "Visionary", "Creator", "Pioneer", "Builder"];
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${randomAdjective} ${randomNoun}`;
};

export const useLobbyStore = create<LobbyState & LobbyActions>((set, get) => ({
  connectionDetails: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  audioLevel: 0,
  selectedAudioDevice: "",
  selectedVideoDevice: "",
  stream: null,
  audioContext: null,
  analyser: null,
  audioDevices: [], // 초기값
  videoDevices: [], // 초기값

  initialize: async (roomTitle, nickname, navigate, toast) => {
    const finalNickname = nickname || generateRandomNickname();
    set({ connectionDetails: { roomTitle: decodeURIComponent(roomTitle), nickname: finalNickname } });
    await get().initializeMedia(toast);
  },

  // 변경점: 미디어 초기화 로직에 장치 목록 로딩 및 자동 선택 기능 통합
  initializeMedia: async (toast: any) => {
    try {
      // 핵심: 먼저 스트림 권한을 얻습니다.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      set({ stream });

      // 핵심: 권한을 얻은 후에 장치 목록을 가져옵니다.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
      const videoInputs = devices.filter(d => d.kind === 'videoinput' && d.deviceId);

      set({ audioDevices: audioInputs, videoDevices: videoInputs });

      // 핵심: 장치 목록이 있으면, 첫 번째 장치를 자동으로 선택하여 빈 문자열 상태를 방지합니다.
      if (audioInputs.length > 0 && !get().selectedAudioDevice) {
        set({ selectedAudioDevice: audioInputs[0].deviceId });
      }
      if (videoInputs.length > 0 && !get().selectedVideoDevice) {
        set({ selectedVideoDevice: videoInputs[0].deviceId });
      }
      
      if (get().isAudioEnabled) {
        get().initializeAudioAnalysis(stream);
      }
      
      toast.success("Camera and microphone ready!");
    } catch (error) {
      toast.error("Please allow camera and microphone access");
      console.error("Media access error:", error);
    }
  },

  initializeAudioAnalysis: (stream: MediaStream) => {
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
    const { isAudioEnabled, stream } = get();
    const newState = !isAudioEnabled;
    set({ isAudioEnabled: newState });
    stream?.getAudioTracks().forEach(track => { track.enabled = newState; });
  },

  toggleVideo: async (toast: any) => {
    // 로직은 기존과 유사하게 유지
    const { isVideoEnabled, stream } = get();
    const newVideoState = !isVideoEnabled;
    set({ isVideoEnabled: newVideoState });
    stream?.getVideoTracks().forEach(track => { track.enabled = newVideoState; });
  },

  // 변경점: 장치 변경 시 localStorage에 저장하는 로직 추가
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
    set({
      connectionDetails: null,
      stream: null,
      audioContext: null,
      analyser: null,
      audioLevel: 0,
      audioDevices: [],
      videoDevices: [],
    });
  }
}));
