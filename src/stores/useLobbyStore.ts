import { create } from 'zustand';

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
}

interface LobbyActions {
  initialize: (navigate: (path: string) => void, toast: any) => Promise<void>;
  initializeMedia: (toast: any) => Promise<void>;
  initializeAudioAnalysis: (stream: MediaStream) => void;
  toggleAudio: () => void;
  toggleVideo: (toast: any) => Promise<void>;
  setSelectedAudioDevice: (deviceId: string) => void;
  setSelectedVideoDevice: (deviceId: string) => void;
  setAudioLevel: (level: number) => void;
  handleJoinRoom: (navigate: (path: string) => void, toast: any) => void;
  cleanup: () => void;
}

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

  initialize: async (navigate: (path: string) => void, toast: any) => {
    const stored = sessionStorage.getItem("connectionDetails");
    if (!stored) {
      navigate("/");
      return;
    }
    
    set({ connectionDetails: JSON.parse(stored) });
    await get().initializeMedia(toast);
  },

  initializeMedia: async (toast: any) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      set({ stream });
      
      const { isAudioEnabled } = get();
      if (isAudioEnabled) {
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
    
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = newState;
      });
    }
  },

  toggleVideo: async (toast: any) => {
    const { isVideoEnabled, isAudioEnabled, stream } = get();
    const newVideoState = !isVideoEnabled;
    
    set({ isVideoEnabled: newVideoState });
    
    if (stream) {
      if (newVideoState) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
          });
          
          stream.getTracks().forEach(track => track.stop());
          set({ stream: newStream });
          
          if (isAudioEnabled) {
            get().initializeAudioAnalysis(newStream);
          }
        } catch (error) {
          console.error("Error restarting video:", error);
        }
      } else {
        stream.getVideoTracks().forEach(track => {
          track.enabled = false;
        });
      }
    }
  },

  setSelectedAudioDevice: (deviceId: string) => set({ selectedAudioDevice: deviceId }),
  
  setSelectedVideoDevice: (deviceId: string) => set({ selectedVideoDevice: deviceId }),
  
  setAudioLevel: (level: number) => set({ audioLevel: level }),

  handleJoinRoom: (navigate: (path: string) => void, toast: any) => {
    const { isAudioEnabled, isVideoEnabled, selectedAudioDevice, selectedVideoDevice } = get();
    
    sessionStorage.setItem("mediaPreferences", JSON.stringify({
      audioEnabled: isAudioEnabled,
      videoEnabled: isVideoEnabled,
      audioDeviceId: selectedAudioDevice,
      videoDeviceId: selectedVideoDevice
    }));

    toast.success("Joining the conversation...");
    navigate("/room");
  },

  cleanup: () => {
    const { stream, audioContext } = get();
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    if (audioContext) {
      audioContext.close();
    }
    
    set({
      stream: null,
      audioContext: null,
      analyser: null,
      audioLevel: 0
    });
  }
}));