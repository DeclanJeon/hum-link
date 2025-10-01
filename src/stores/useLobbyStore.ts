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

  /**
   * 디바이스 초기화 및 선택
   */
  initializeMedia: async (toast: any) => {
    try {
      // 디바이스 capability 감지
      const capabilities = await mediaCapabilityDetector.detectCapabilities();
      set({ mediaCapabilities: capabilities });

      // 저장된 디바이스 ID 로드 (localStorage)
      const preferredAudioDevice = localStorage.getItem("preferredAudioDevice");
      const preferredVideoDevice = localStorage.getItem("preferredVideoDevice");

      // 🔑 핵심: 유효한 디바이스만 필터링
      const validAudioDevices = capabilities.microphones.filter(
        d => d.deviceId && d.deviceId !== "" && d.deviceId !== "default"
      );
      const validVideoDevices = capabilities.cameras.filter(
        d => d.deviceId && d.deviceId !== "" && d.deviceId !== "default"
      );

      // 초기 디바이스 선택 로직
      let selectedAudioId = preferredAudioDevice;
      let selectedVideoId = preferredVideoDevice;

      // 저장된 디바이스가 없거나 유효하지 않으면 첫 번째 선택
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

      // 스트림 획득
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

      // 사용자 피드백
      if (result.isDummy) {
        toast.info("카메라 또는 마이크가 감지되지 않았습니다. 수신 전용 모드로 참여할 수 있습니다.");
      } else if (result.warnings.length > 0) {
        toast.warning(`제한된 접근: ${result.warnings.join(', ')}`);
      } else {
        toast.success("카메라와 마이크가 준비되었습니다!");
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
        streamWarnings: ['미디어 디바이스에 접근할 수 없습니다']
      });
      
      toast.error("미디어 디바이스에 접근할 수 없습니다. 수신 전용 모드로 참여합니다.");
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

   /**
    * 오디오 디바이스 변경
    */
   setSelectedAudioDevice: async (deviceId: string, toast: any) => {
     const { stream, audioDevices } = get();
     
     // 유효성 검사
     const device = audioDevices.find(d => d.deviceId === deviceId);
     if (!device) {
       console.error('[Lobby] Invalid audio device:', deviceId);
       return;
     }
     
     try {
       // 새 오디오 스트림 생성
       const newAudioStream = await navigator.mediaDevices.getUserMedia({
         audio: { deviceId: { exact: deviceId } }
       });
       
       const newAudioTrack = newAudioStream.getAudioTracks()[0];
       
       if (stream) {
         // 기존 오디오 트랙 교체
         const oldAudioTrack = stream.getAudioTracks()[0];
         if (oldAudioTrack) {
           stream.removeTrack(oldAudioTrack);
           oldAudioTrack.stop();
         }
         
         stream.addTrack(newAudioTrack);
         
         // 오디오 분석 재초기화
         get().initializeAudioAnalysis(stream);
       }
       
       set({ selectedAudioDevice: deviceId });
       localStorage.setItem("preferredAudioDevice", deviceId);
       
       toast.success(`마이크 변경: ${device.label}`);
       
     } catch (error) {
       console.error('[Lobby] Failed to change audio device:', error);
       toast.error('마이크 변경 실패');
     }
  },
   
   /**
    * 비디오 디바이스 변경
    */
   setSelectedVideoDevice: async (deviceId: string, toast: any) => {
     const { stream, videoDevices } = get();
     
     // 유효성 검사
     const device = videoDevices.find(d => d.deviceId === deviceId);
     if (!device) {
       console.error('[Lobby] Invalid video device:', deviceId);
       return;
     }
     
     try {
       // 새 비디오 스트림 생성
       const newVideoStream = await navigator.mediaDevices.getUserMedia({
         video: {
           deviceId: { exact: deviceId },
           width: { ideal: 1280 },
           height: { ideal: 720 }
         }
       });
       
       const newVideoTrack = newVideoStream.getVideoTracks()[0];
       
       if (stream) {
         // 기존 비디오 트랙 교체
         const oldVideoTrack = stream.getVideoTracks()[0];
         if (oldVideoTrack) {
           const wasEnabled = oldVideoTrack.enabled;
           
           stream.removeTrack(oldVideoTrack);
           oldVideoTrack.stop();
           
           stream.addTrack(newVideoTrack);
           newVideoTrack.enabled = wasEnabled;
         }
       }
       
       set({ selectedVideoDevice: deviceId });
       localStorage.setItem("preferredVideoDevice", deviceId);
       
       toast.success(`카메라 변경: ${device.label}`);
       
     } catch (error) {
       console.error('[Lobby] Failed to change video device:', error);
       toast.error('카메라 변경 실패');
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
