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
  | { type: 'file-chunk'; payload: { transferId: string; chunk: number[]; isLast: boolean } }
  | { type: 'transcription'; payload: { text: string; isFinal: boolean; lang: string } };

function isChannelMessage(obj: any): obj is ChannelMessage {
    return obj && typeof obj.type === 'string' && 'payload' in obj;
}

export const useRoomOrchestrator = (params: RoomParams | null) => {
  const { connect, disconnect } = useSignalingStore();
  const { initialize: initPeerConnection, cleanup: cleanupPeerConnection, createPeer, receiveSignal, removePeer, updatePeerMediaState } = usePeerConnectionStore();
  const { setLocalStream, cleanup: cleanupMediaDevice } = useMediaDeviceStore();
  const { addMessage, setTypingState, addFileMessage, appendFileChunk, clearChat } = useChatStore();
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
          if (sender) {
            setTypingState(peerId, sender.nickname, parsedData.payload.isTyping);
          }
          break;
        case 'whiteboard-event':
          applyRemoteDrawEvent(parsedData.payload);
          break;
        case 'file-meta':
          addFileMessage(peerId, senderNickname, parsedData.payload);
          break;
        case 'file-chunk':
          const { transferId, chunk, isLast } = parsedData.payload;
          const buffer = new Uint8Array(chunk).buffer;
          appendFileChunk(transferId, buffer, isLast);
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
      }
    } catch (e) {
      console.error("Failed to process DataChannel message:", e);
    }
  }, [addMessage, setTypingState, applyRemoteDrawEvent, addFileMessage, appendFileChunk, incrementUnreadMessageCount]);


  useEffect(() => {
    if (!params) return;

    const { roomId, userId, nickname, localStream } = params;

    setLocalStream(localStream);
    initPeerConnection(localStream, { onData: handleChannelMessage });

    const signalingEvents = {
      onConnect: () => console.log('[SIGNALING_CORE] ✅ 시그널링 서버와 신경망 동기화 완료.'),
      onDisconnect: () => console.log('[SIGNALING_CORE] 🔌 시그널링 서버와 연결 해제됨.'),
      // ✅ 수정: 새로 참여한 사용자는 기존 사용자에게 연결을 '시도' (initiator: true)
      onRoomUsers: (users: { id: string; nickname: string }[]) => {
        console.log(`[SYNAPSE_ORCHESTRATOR] 🗺️ 방에 이미 있는 피어 목록 수신:`, users.map(u => u.nickname));
        users.forEach(user => {
            console.log(`[SYNAPSE_ORCHESTRATOR] 🤝 기존 피어(${user.nickname})와의 핸드셰이크 개시 (Initiator: true)`);
            createPeer(user.id, user.nickname, true);
        });
      },
      // ✅ 수정: 기존 사용자는 새로 참여한 사용자의 연결을 '대기' (initiator: false)
      onUserJoined: (user: { id: string; nickname: string }) => {
        console.log(`[SYNAPSE_ORCHESTRATOR] 👋 새로운 피어(${user.nickname}) 입장. 연결 제안 대기 (Initiator: false)`);
        createPeer(user.id, user.nickname, false);
      },
      onUserLeft: (userId: string) => {
        console.log(`[SYNAPSE_ORCHESTRATOR] 💨 피어(${userId}) 퇴장.`);
        removePeer(userId);
      },
      onSignal: ({ from, signal }: { from: string; signal: any }) => {
        const peer = usePeerConnectionStore.getState().peers.get(from);
        receiveSignal(from, peer?.nickname || 'Unknown', signal);
      },
      onMediaState: ({ userId, kind, enabled }: { userId: string; kind: 'audio' | 'video'; enabled: boolean }) => {
        updatePeerMediaState(userId, kind, enabled);
      },
      onChatMessage: (message: any) => { /* Fallback, P2P로 처리 */ },
      onData: (data: any) => {
        const { from, type, data: payload } = data;
        const message = { type, payload };
        handleChannelMessage(from, JSON.stringify(message));
      },
    };

    console.log(`[SIGNALING_CORE] 🧠 시그널링 스토어에 연결 시도: ${ENV.VITE_SIGNALING_SERVER_URL}`);
    connect(roomId, userId, nickname, signalingEvents);

    return () => {
      console.log('[SYNAPSE_ORCHESTRATOR] 🧹 방을 떠나며 모든 연결과 상태를 정리합니다.');
      disconnect();
      cleanupPeerConnection();
      cleanupMediaDevice();
      cleanupTranscription();
      clearChat();
      // UI 리셋은 필요 시 호출
      // resetUI(); 
      resetWhiteboard();
    };
  }, [params]);
};