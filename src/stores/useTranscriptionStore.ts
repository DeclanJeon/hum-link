import { create } from 'zustand';
import { usePeerConnectionStore } from './usePeerConnectionStore';

type DataChannelMessage = {
  type: 'transcription';
  payload: { text: string; isFinal: boolean; lang: string };
};

interface TranscriptionState {
  isTranscriptionEnabled: boolean;
  transcriptionLanguage: string;
  translationTargetLanguage: string;
  localTranscript: { text: string; isFinal: boolean };
}

interface TranscriptionActions {
  toggleTranscription: () => void;
  setTranscriptionLanguage: (lang: string) => void;
  setTranslationTargetLanguage: (lang: string) => void;
  setLocalTranscript: (transcript: { text: string; isFinal: boolean }) => void;
  sendTranscription: (text: string, isFinal: boolean) => void;
  handleIncomingTranscription: (peerId: string, payload: { text: string; isFinal: boolean; lang: string }) => void;
  cleanup: () => void;
}

export const useTranscriptionStore = create<TranscriptionState & TranscriptionActions>((set, get) => ({
  isTranscriptionEnabled: false,
  transcriptionLanguage: 'en-US',
  translationTargetLanguage: 'none',
  localTranscript: { text: '', isFinal: false },

  toggleTranscription: () => set((state) => ({ isTranscriptionEnabled: !state.isTranscriptionEnabled })),
  
  setTranscriptionLanguage: (lang) => set({ transcriptionLanguage: lang }),
  
  setTranslationTargetLanguage: (lang) => set({ translationTargetLanguage: lang }),
  
  setLocalTranscript: (transcript) => set({ localTranscript: transcript }),
  
  sendTranscription: (text, isFinal) => {
    const { sendToAllPeers } = usePeerConnectionStore.getState();
    const data: DataChannelMessage = {
      type: 'transcription',
      payload: { text, isFinal, lang: get().transcriptionLanguage },
    };
    sendToAllPeers(JSON.stringify(data));
 },

  handleIncomingTranscription: (peerId, payload) => {
    // Handle incoming transcription from other peers
    // This could be extended to store transcriptions from specific peers if needed
  },

  cleanup: () => {
    set({
      isTranscriptionEnabled: false,
      localTranscript: { text: '', isFinal: false },
    });
  },
}));