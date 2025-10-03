import { useMemo } from 'react';
import { usePeerConnectionStore, PeerState } from '@/stores/usePeerConnectionStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';

export interface Participant extends PeerState {
  isLocal: boolean;
  stream: MediaStream | null;
}

export const useParticipants = (): Participant[] => {
  const peers = usePeerConnectionStore(state => state.peers);
  const { localStream, isVideoEnabled, isAudioEnabled, isSharingScreen } = useMediaDeviceStore();
  const { getSessionInfo } = useSessionStore();
  const { isStreaming: isFileStreaming } = useFileStreamingStore();
  const { localTranscript, transcriptionLanguage } = useTranscriptionStore();

  const sessionInfo = getSessionInfo();
  const localUserId = sessionInfo?.userId || 'local';
  const localNickname = sessionInfo?.nickname || 'You';

  const participants = useMemo<Participant[]>(() => {
    const localParticipant: Participant = {
      userId: localUserId,
      nickname: localNickname,
      stream: localStream,
      isLocal: true,
      audioEnabled: isAudioEnabled,
      videoEnabled: isVideoEnabled,
      isSharingScreen: isSharingScreen,
      connectionState: 'connected',
      transcript: localTranscript ? { ...localTranscript, lang: transcriptionLanguage } : undefined,
      isStreamingFile: isFileStreaming,
    };

    const remoteParticipants: Participant[] = Array.from(peers.values()).map(peer => ({
      ...peer,
      isLocal: false,
      stream: peer.stream || null,
    }));

    return [localParticipant, ...remoteParticipants];
  }, [
    peers,
    localStream,
    isVideoEnabled,
    isAudioEnabled,
    isSharingScreen,
    localUserId,
    localNickname,
    isFileStreaming,
    localTranscript,
    transcriptionLanguage,
  ]);

  return participants;
};
