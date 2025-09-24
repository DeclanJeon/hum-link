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
  const { initialize: initPeerConnection, cleanup: cleanupPeerConnection, createPeer, receiveSignal, removePeer, updatePeerMediaState } = usePeerConnectionStore();
  const { setLocalStream, cleanup: cleanupMediaDevice } = useMediaDeviceStore();
  const { addMessage, setTypingState, handleIncomingChunk, addFileMessage } = useChatStore();
  const { incrementUnreadMessageCount } = useUIManagementStore();
  const { applyRemoteDrawEvent, reset: resetWhiteboard } = useWhiteboardStore();
  const { cleanup: cleanupTranscription } = useTranscriptionStore();

  const handleChannelMessage = useCallback((peerId: string, data: any) => {
    // =================▼▼▼ 핵심 수정 지점: Try-Catch 기반 프로토콜 분기 ▼▼▼=================
    try {
        // 1. 모든 데이터는 일단 JSON으로 간주하고 파싱을 시도합니다.
        const parsedData = JSON.parse(data.toString());

        // 2. 파싱 성공 시, 구조화된 메시지로 처리합니다.
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
                if (sender) {
                    setTypingState(peerId, sender.nickname, parsedData.payload.isTyping);
                }
                break;
            case 'whiteboard-event':
                applyRemoteDrawEvent(parsedData.payload);
                break;
            case 'file-meta':
                // 파일 메타데이터를 수신하면, 파일 수신 준비를 시작합니다.
                addFileMessage(peerId, senderNickname, parsedData.payload, false);
                break;
            case 'transcription':
                usePeerConnectionStore.setState(
                    produce(state => {
                        const peer = state.peers.get(peerId);
                        if (peer) {
                            peer.transcript = parsedData.payload;
                        }
                    })
                );
                break;
            default:
                console.warn(`[Orchestrator] Unknown JSON message type: ${parsedData}`);
        }
    } catch (error) {
        // 3. JSON 파싱 실패 시, 이 데이터는 바이너리(파일 청크)로 간주합니다.
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            handleIncomingChunk(peerId, data);
        } else {
            // 이 로그는 거의 발생하지 않아야 합니다.
            console.error("Failed to process DataChannel message as JSON:", error, "Raw data:", data.toString());
        }
    }
    // =================▲▲▲ 핵심 수정 지점 ▲▲▲=================
  }, [addMessage, setTypingState, applyRemoteDrawEvent, incrementUnreadMessageCount, handleIncomingChunk, addFileMessage]);

  useEffect(() => {
    if (!params) return;

    const { roomId, userId, nickname, localStream } = params;

    setLocalStream(localStream);
    initPeerConnection(localStream, { onData: handleChannelMessage });

    const signalingEvents = {
      onConnect: () => console.log('[SIGNALING_CORE]      .'),
      onDisconnect: () => console.log('[SIGNALING_CORE]     .'),
      onRoomUsers: (users: { id: string; nickname: string }[]) => {
        console.log(`[SYNAPSE_ORCHESTRATOR]       :`, users.map(u => u.nickname));
        users.forEach(user => {
            console.log(`[SYNAPSE_ORCHESTRATOR]   (${user.nickname})   (Initiator: true)`);
            createPeer(user.id, user.nickname, true);
        });
      },
      onUserJoined: (user: { id: string; nickname: string }) => {
        console.log(`[SYNAPSE_ORCHESTRATOR]   (${user.nickname}) .    (Initiator: false)`);
        createPeer(user.id, user.nickname, false);
      },
      onUserLeft: (userId: string) => {
        console.log(`[SYNAPSE_ORCHESTRATOR]  (${userId}) .`);
        removePeer(userId);
      },
      onSignal: ({ from, signal }: { from: string; signal: any }) => {
        const peer = usePeerConnectionStore.getState().peers.get(from);
        receiveSignal(from, peer?.nickname || 'Unknown', signal);
      },
      onMediaState: ({ userId, kind, enabled }: { userId: string; kind: 'audio' | 'video'; enabled: boolean }) => {
        updatePeerMediaState(userId, kind, enabled);
      },
      onChatMessage: (message: any) => { /* Fallback, P2P  */ },
      onData: (data: SignalingDataPayload) => {
        const { from, type, data: payload } = data;
        const message = { type, payload };
        handleChannelMessage(from, JSON.stringify(message));
      },
    };

    console.log(`[SIGNALING_CORE]     : ${ENV.VITE_SIGNALING_SERVER_URL}`);
    connect(roomId, userId, nickname, signalingEvents);

    return () => {
      console.log('[SYNAPSE_ORCHESTRATOR]       .');
      disconnect();
      cleanupPeerConnection();
      cleanupMediaDevice();
      cleanupTranscription();
    };
  }, [params]);
};
