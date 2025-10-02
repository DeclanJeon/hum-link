// frontend/src/stores/useSettingsStore.ts
import { create } from 'zustand';

interface SettingsState {
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  selectedVideoDevice: string;
  micVolume: number[];
  speakerVolume: number[];
}

interface SettingsActions {
  setAudioDevices: (devices: MediaDeviceInfo[]) => void;
  setVideoDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedAudioDevice: (deviceId: string) => void;
  setSelectedVideoDevice: (deviceId: string) => void;
  setMicVolume: (volume: number[]) => void;
  setSpeakerVolume: (volume: number[]) => void;
  initializeDevices: () => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  audioDevices: [],
  videoDevices: [],
  selectedAudioDevice: "",
  selectedVideoDevice: "",
  micVolume: [70],
  speakerVolume: [80],

  setAudioDevices: (devices: MediaDeviceInfo[]) => set({ audioDevices: devices }),
  
  setVideoDevices: (devices: MediaDeviceInfo[]) => set({ videoDevices: devices }),
  
  setSelectedAudioDevice: (deviceId: string) => set({ selectedAudioDevice: deviceId }),
  
  setSelectedVideoDevice: (deviceId: string) => set({ selectedVideoDevice: deviceId }),
  
  setMicVolume: (volume: number[]) => set({ micVolume: volume }),
  
  setSpeakerVolume: (volume: number[]) => set({ speakerVolume: volume }),

  initializeDevices: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      set({
        audioDevices: devices.filter(device => device.kind === 'audioinput'),
        videoDevices: devices.filter(device => device.kind === 'videoinput')
      });
      
      console.log('[SettingsStore] Devices initialized:', {
        audio: devices.filter(d => d.kind === 'audioinput').length,
        video: devices.filter(d => d.kind === 'videoinput').length
      });
    } catch (error) {
      console.error('[SettingsStore] Error getting devices:', error);
    }
  },

  reset: () => set({
    audioDevices: [],
    videoDevices: [],
    selectedAudioDevice: "",
    selectedVideoDevice: "",
    micVolume: [70],
    speakerVolume: [80]
  })
}));