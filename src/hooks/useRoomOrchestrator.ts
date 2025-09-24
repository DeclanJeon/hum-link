import { useEffect, useCallback } from 'react';
import { produce } from 'immer';
import { useSignalingStore } from '@/stores/useSignalingStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { useChatStore } from '@/stores/useChatStore';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useWhiteboardStore } from '@/stores/useWhiteboardStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';
import { ENV } from '@/config';

interface RoomParams {
  roomId: string;
  userId: string;
  nickname: string;
  localStream: MediaStream;
}

type ChannelMessage =
  | { type: 'chat'; payload: any }
  | { type: 'typing-state'; payload: { isTyping: boolean } }
  | { type: 'whiteboard-event'; payload: any }
  | { type: 'file-meta'; payload: any }
  | { type: 'file-ack'; payload: { transferId: string; chunkIndex: number } }
  | { type: 'transcription'; payload: { text: string; isFinal: boolean; lang: string } };

function isChannelMessage(obj: any): obj is ChannelMessage {
    return obj && typeof obj.type === 'string' && 'payload' in obj;
}

interface SignalingDataPayload {
    from: string;
    type: string;
    data: any;
}

export const useRoomOrchestrator = (params: RoomParams | null) => {
  const { connect, disconnect } = useSignalingStore();
  const { initialize: initPeerConnection, cleanup: cleanupPeerConnection, createPeer, receiveSignal, removePeer, updatePeerMediaState, resolveAck } = usePeerConnectionStore();
  const { setLocalStream, cleanup: cleanupMediaDevice } = useMediaDeviceStore();
  const { addMessage, setTypingState, handleIncomingChunk, addFileMessage } = useChatStore();
  const { incrementUnreadMessageCount } = useUIManagementStore();
  const { applyRemoteDrawEvent, reset: resetWhiteboard } = useWhiteboardStore();
  const { cleanup: cleanupTranscription } = useTranscriptionStore();

  const handleChannelMessage = useCallback((peerId: string, data: any) => {
    try {
        const parsedData = JSON.parse(data.toString());
        if (!isChannelMessage(parsedData)) return;
      
        const peers = usePeerConnectionStore.getState().peers;
        const sender = peers.get(peerId);
        const senderNickname = sender ? sender.nickname : 'Unknown';

        switch (parsedData.type) {
            case 'chat':
                addMessage(parsedData.payload);
                if (useUIManagementStore.getState().activePanel !== 'chat') {
                    incrementUnreadMessageCount();
                }
                break;
            case 'typing-state':
                if (sender) setTypingState(peerId, sender.nickname, parsedData.payload.isTyping);
                break;
            case 'whiteboard-event':
                applyRemoteDrawEvent(parsedData.payload);
                break;
            case 'file-meta':
                addFileMessage(peerId, senderNickname, parsedData.payload, false);
                break;
            case 'file-ack':
                resolveAck(parsedData.payload.transferId, parsedData.payload.chunkIndex);
                break;
            case 'transcription':
                usePeerConnectionStore.setState(
                    produce(state => {
                        const peer = state.peers.get(peerId);
                        if (peer) peer.transcript = parsedData.payload;
                    })
                );
                break;
            default:
                console.warn(`[Orchestrator] Unknown JSON message type: ${parsedData}`);
        }
    } catch (error) {
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            handleIncomingChunk(peerId, data);
        } else {
            console.error("Failed to process DataChannel message as JSON:", error, "Raw data:", data.toString());
        }
    }
  }, [addMessage, setTypingState, applyRemoteDrawEvent, incrementUnreadMessageCount, handleIncomingChunk, addFileMessage, resolveAck]);

  useEffect(() => {
    if (!params) return;

    const { roomId, userId, nickname, localStream } = params;

    setLocalStream(localStream);
    initPeerConnection(localStream, { onData: handleChannelMessage });

    const signalingEvents = {
      onConnect: () => console.log('[SIGNALING_CORE]      .'),
      onDisconnect: () => console.log('[SIGNALING_CORE]     .'),
      onRoomUsers: (users: { id: string; nickname: string }[]) => {
        users.forEach(user => {
            createPeer(user.id, user.nickname, true);
        });
      },
      onUserJoined: (user: { id: string; nickname: string }) => {
        createPeer(user.id, user.nickname, false);
      },
      onUserLeft: (userId: string) => {
        removePeer(userId);
      },
      onSignal: ({ from, signal }: { from: string; signal: any }) => {
        const peer = usePeerConnectionStore.getState().peers.get(from);
        receiveSignal(from, peer?.nickname || 'Unknown', signal);
      },
      onMediaState: ({ userId, kind, enabled }: { userId: string; kind: 'audio' | 'video'; enabled: boolean }) => {
        updatePeerMediaState(userId, kind, enabled);
      },
      onChatMessage: (message: any) => { /* Not used in P2P */ },
      onData: (data: SignalingDataPayload) => { /* Not used in P2P */ },
    };

    connect(roomId, userId, nickname, signalingEvents);

    return () => {
      disconnect();
      cleanupPeerConnection();
      cleanupMediaDevice();
      cleanupTranscription();
      resetWhiteboard();
    };
  }, [params]);
};
