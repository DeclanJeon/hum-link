import { create } from 'zustand';

interface ConnectionDetails {
  roomId: string;
  nickname: string;
}

interface MediaPreferences {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

type ActivePanel = "chat" | "whiteboard" | "settings" | "none";

interface RoomState {
  connectionDetails: ConnectionDetails | null;
  mediaPreferences: MediaPreferences | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnecting: boolean;
  activePanel: ActivePanel;
}

interface RoomActions {
  init: () => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setActivePanel: (panel: ActivePanel) => void;
  cleanup: () => void;
}

export const useRoomStore = create<RoomState & RoomActions>((set, get) => ({
  connectionDetails: null,
  mediaPreferences: null,
  localStream: null,
  remoteStream: null,
  isConnecting: false,
  activePanel: "none",

  init: async () => {
    set({ isConnecting: true });
    
    try {
      // Get connection details from session storage
      const connectionData = sessionStorage.getItem("connectionDetails");
      const mediaData = sessionStorage.getItem("mediaPreferences");
      
      if (connectionData && mediaData) {
        const connectionDetails = JSON.parse(connectionData);
        const mediaPreferences = JSON.parse(mediaData);
        
        set({ 
          connectionDetails, 
          mediaPreferences,
          isConnecting: false 
        });

        // Get user media if video is enabled
        if (mediaPreferences.videoEnabled || mediaPreferences.audioEnabled) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: mediaPreferences.videoEnabled,
              audio: mediaPreferences.audioEnabled
            });
            set({ localStream: stream });
          } catch (error) {
            console.error('Error accessing media devices:', error);
          }
        }
      } else {
        set({ isConnecting: false });
      }
    } catch (error) {
      console.error('Error initializing room:', error);
      set({ isConnecting: false });
    }
  },

  toggleAudio: () => {
    const { mediaPreferences, localStream } = get();
    if (mediaPreferences) {
      const newPreferences = { 
        ...mediaPreferences, 
        audioEnabled: !mediaPreferences.audioEnabled 
      };
      set({ mediaPreferences: newPreferences });
      sessionStorage.setItem("mediaPreferences", JSON.stringify(newPreferences));
      
      // Toggle audio track if stream exists
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = newPreferences.audioEnabled;
        });
      }
    }
  },

  toggleVideo: () => {
    const { mediaPreferences, localStream } = get();
    if (mediaPreferences) {
      const newPreferences = { 
        ...mediaPreferences, 
        videoEnabled: !mediaPreferences.videoEnabled 
      };
      set({ mediaPreferences: newPreferences });
      sessionStorage.setItem("mediaPreferences", JSON.stringify(newPreferences));
      
      // Toggle video track if stream exists
      if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = newPreferences.videoEnabled;
        });
      }
    }
  },

  setActivePanel: (panel: ActivePanel) => {
    const currentPanel = get().activePanel;
    set({ activePanel: currentPanel === panel ? "none" : panel });
  },

  cleanup: () => {
    const { localStream } = get();
    
    // Stop all tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Clear session storage
    sessionStorage.removeItem("connectionDetails");
    sessionStorage.removeItem("mediaPreferences");
    
    // Reset state
    set({
      connectionDetails: null,
      mediaPreferences: null,
      localStream: null,
      remoteStream: null,
      isConnecting: false,
      activePanel: "none"
    });
  }
}));