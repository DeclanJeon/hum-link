/**
 * @fileoverview Room Orchestrator Hook - 방 관리 오케스트레이터
 * @module hooks/useRoomOrchestrator
 */

import { useEffect, useCallback } from 'react';
import { produce } from 'immer';
import { useSignalingStore } from '@/stores/useSignalingStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { useChatStore } from '@/stores/useChatStore';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useWhiteboardStore } from '@/stores/useWhiteboardStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';
import { useSubtitleStore } from '@/stores/useSubtitleStore';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
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
  | { type: 'transcription'; payload: { text: string; isFinal: boolean; lang: string } }
  | { type: 'subtitle-sync'; payload: { currentTime: number; cueId: string | null; activeTrackId: string | null; timestamp: number } }
  | { type: 'subtitle-seek'; payload: { currentTime: number; timestamp: number } }
  | { type: 'subtitle-state'; payload: any }
  | { type: 'subtitle-track'; payload: any }
  | { type: 'file-streaming-state'; payload: { isStreaming: boolean; fileType: string } };

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
  const { 
    initialize: initPeerConnection, 
    cleanup: cleanupPeerConnection,
    createPeer, 
    receiveSignal, 
    removePeer, 
    updatePeerMediaState, 
    resolveAck,
    updatePeerStreamingState 
  } = usePeerConnectionStore();
  const { setLocalStream, cleanup: cleanupMediaDevice } = useMediaDeviceStore();
  const { addMessage, setTypingState, handleIncomingChunk, addFileMessage } = useChatStore();
  const { incrementUnreadMessageCount } = useUIManagementStore();
  const { applyRemoteDrawEvent, reset: resetWhiteboard } = useWhiteboardStore();
  const { cleanup: cleanupTranscription } = useTranscriptionStore();
  const { 
    receiveSubtitleState, 
    receiveSubtitleSync,
    setRemoteSubtitleCue,
    tracks, 
    activeTrackId 
  } = useSubtitleStore();
  const { isStreaming: isLocalStreaming } = useFileStreamingStore();

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
            
            // 파일 스트리밍 상태 동기화
            case 'file-streaming-state':
                {
                    const { isStreaming, fileType } = parsedData.payload;
                    // 피어의 파일 스트리밍 상태 업데이트
                    if (updatePeerStreamingState) {
                        updatePeerStreamingState(peerId, isStreaming);
                    }
                    
                    // 원격 자막 활성화 상태 업데이트
                    if (isStreaming && fileType === 'video') {
                        useSubtitleStore.setState({ isRemoteSubtitleEnabled: true });
                    } else if (!isStreaming) {
                        useSubtitleStore.setState({ 
                            isRemoteSubtitleEnabled: false,
                            remoteSubtitleCue: null 
                        });
                    }
                }
                break;
        
            // 자막 동기화 메시지 처리
            case 'subtitle-sync':
                {
                    const { currentTime, cueId, activeTrackId: remoteTrackId } = parsedData.payload;
                    
                    // 원격 피어가 파일 스트리밍 중인지 확인
                    const peer = peers.get(peerId);
                    if (peer?.isStreamingFile) {
                        // 자막 동기화 수신
                        receiveSubtitleSync(currentTime, cueId, remoteTrackId);
                    }
                }
                break;
          
            case 'subtitle-seek':
                {
                    const { currentTime } = parsedData.payload;
                    // 원격 비디오 시크에 따른 자막 동기화
                    const subtitleStore = useSubtitleStore.getState();
                    subtitleStore.syncWithRemoteVideo(currentTime);
                }
                break;
          
            case 'subtitle-state':
                // 자막 설정 상태 수신
                receiveSubtitleState(parsedData.payload);
                break;
          
            case 'subtitle-track':
                // 자막 트랙 수신
                {
                    const { track } = parsedData.payload;
                    useSubtitleStore.setState(
                        produce(state => {
                            state.remoteTracks.set(track.id, track);
                            // 첫 번째 원격 트랙이면 자동 활성화
                            if (!state.remoteActiveTrackId) {
                                state.remoteActiveTrackId = track.id;
                            }
                        })
                    );
                }
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
  }, [
    addMessage,
    setTypingState,
    applyRemoteDrawEvent,
    incrementUnreadMessageCount,
    handleIncomingChunk,
    addFileMessage,
    resolveAck,
    receiveSubtitleState,
    receiveSubtitleSync,
    setRemoteSubtitleCue,
    updatePeerStreamingState
  ]);

  useEffect(() => {
    if (!params) return;

    const { roomId, userId, nickname, localStream } = params;

    setLocalStream(localStream);
    initPeerConnection(localStream, { onData: handleChannelMessage });

    const signalingEvents = {
      onConnect: () => {
        console.log('[SIGNALING_CORE] 서버에 연결되었습니다.')
        // 연결 즉시 TURN 자격증명 요청
        const socket = useSignalingStore.getState().socket;
        socket?.emit('request-turn-credentials');
      },
      onDisconnect: () => console.log('[SIGNALING_CORE] 서버와의 연결이 끊어졌습니다.'),
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
  
  // 파일 스트리밍 상태 변경 감지 및 브로드캐스트
  useEffect(() => {
    if (isLocalStreaming !== undefined) {
      const { sendToAllPeers } = usePeerConnectionStore.getState();
      const { fileType } = useFileStreamingStore.getState();
      
      const message = JSON.stringify({
        type: 'file-streaming-state',
        payload: { isStreaming: isLocalStreaming, fileType }
      });
      
      sendToAllPeers(message);
    }
  }, [isLocalStreaming]);
};