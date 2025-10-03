/**
 * @fileoverview Room Orchestrator Hook - WebRTC, ,      ()
 * @module hooks/useRoomOrchestrator
 */

import { useEffect, useCallback } from 'react';
import { produce } from 'immer';
import { useSignalingStore, SignalingEvents } from '@/stores/useSignalingStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { useChatStore, ChatMessage } from '@/stores/useChatStore';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useWhiteboardStore } from '@/stores/useWhiteboardStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';
import { useSubtitleStore } from '@/stores/useSubtitleStore';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';

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
  | { type: 'file-streaming-state'; payload: { isStreaming: boolean; fileType: string } }
  | { type: 'screen-share-state'; payload: { isSharing: boolean } };

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
    updatePeerStreamingState,
    updatePeerScreenShareState
  } = usePeerConnectionStore();
  
  const { addMessage, setTypingState, handleIncomingChunk, addFileMessage } = useChatStore();
  const { incrementUnreadMessageCount, setMainContentParticipant } = useUIManagementStore();
  const { applyRemoteDrawEvent, reset: resetWhiteboard } = useWhiteboardStore();
  const { cleanup: cleanupTranscription } = useTranscriptionStore();
  const { 
    receiveSubtitleState, 
    receiveSubtitleSync,
    setRemoteSubtitleCue,
  } = useSubtitleStore();
  const { isStreaming: isLocalStreaming } = useFileStreamingStore();

  /**
   *    
   */
  const handleChannelMessage = useCallback((peerId: string, data: any) => {
    try {
        const parsedData = JSON.parse(data.toString());
        if (!isChannelMessage(parsedData)) return;
      
        const sender = usePeerConnectionStore.getState().peers.get(peerId);
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
                
            case 'transcription':
                usePeerConnectionStore.setState(
                    produce(state => {
                        const peer = state.peers.get(peerId);
                        if (peer) peer.transcript = parsedData.payload;
                    })
                );
                break;
            
            case 'file-streaming-state':
                {
                    const { isStreaming, fileType } = parsedData.payload;
                    updatePeerStreamingState(peerId, isStreaming);
                    
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
            
            case 'screen-share-state':
                updatePeerScreenShareState(peerId, parsedData.payload.isSharing);
                if (parsedData.payload.isSharing) {
                    setMainContentParticipant(peerId);
                } else {
                    if (useUIManagementStore.getState().mainContentParticipantId === peerId) {
                        setMainContentParticipant(null);
                    }
                }
                break;
        
            case 'subtitle-sync':
                {
                    const peer = usePeerConnectionStore.getState().peers.get(peerId);
                    if (peer?.isStreamingFile) {
                        receiveSubtitleSync(
                          parsedData.payload.currentTime,
                          parsedData.payload.cueId,
                          parsedData.payload.activeTrackId
                        );
                    }
                }
                break;
          
            case 'subtitle-seek':
                {
                    const { currentTime } = parsedData.payload;
                    useSubtitleStore.getState().syncWithRemoteVideo(currentTime);
                }
                break;
          
            case 'subtitle-state':
                receiveSubtitleState(parsedData.payload);
                break;
          
            case 'subtitle-track':
                {
                    const { track } = parsedData.payload;
                    useSubtitleStore.setState(
                        produce(state => {
                            state.remoteTracks.set(track.id, track);
                            if (!state.remoteActiveTrackId) {
                                state.remoteActiveTrackId = track.id;
                            }
                        })
                    );
                }
                break;
          
            default:
                console.warn(`[Orchestrator] Unknown JSON message type: ${parsedData.type}`);
        }
    } catch (error) {
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            handleIncomingChunk(peerId, data);
        } else {
            console.error("Failed to process DataChannel message:", error, "Raw data:", data.toString());
        }
    }
  }, [
    addMessage,
    setTypingState,
    applyRemoteDrawEvent,
    incrementUnreadMessageCount,
    handleIncomingChunk,
    addFileMessage,
    receiveSubtitleState,
    receiveSubtitleSync,
    setRemoteSubtitleCue,
    updatePeerStreamingState,
    updatePeerScreenShareState,
    setMainContentParticipant
  ]);

  /**
   * Room     
   */
  useEffect(() => {
    if (!params) return;

    const { roomId, userId, nickname, localStream } = params;

    initPeerConnection(localStream, { onData: handleChannelMessage });

    const signalingEvents: SignalingEvents = {
      onConnect: () => console.log('[SIGNALING_CORE]  .'),
      onDisconnect: () => console.log('[SIGNALING_CORE]   .'),
      onRoomUsers: (users) => {
        users.forEach(user => {
            if (user.id !== userId) {
              createPeer(user.id, user.nickname, true);
            }
        });
      },
      onUserJoined: (user) => {
        if (user.id !== userId) {
          createPeer(user.id, user.nickname, false);
        }
      },
      onUserLeft: (userId) => removePeer(userId),
      onSignal: ({ from, signal }) => {
        const peer = usePeerConnectionStore.getState().peers.get(from);
        receiveSignal(from, peer?.nickname || 'Unknown', signal);
      },
      onMediaState: ({ userId, kind, enabled }) => {
        updatePeerMediaState(userId, kind, enabled);
      },
      onChatMessage: (message) => addMessage(message),
      onData: (data) => {
        if (data.type === 'file-meta') {
          const sender = usePeerConnectionStore.getState().peers.get(data.from);
          const senderNickname = sender ? sender.nickname : 'Unknown';
          addFileMessage(data.from, senderNickname, data.payload, false);
        }
      },
    };

    connect(roomId, userId, nickname, signalingEvents);

    return () => {
      disconnect();
      cleanupPeerConnection();
      cleanupTranscription();
      resetWhiteboard();
    };
  }, [params]);
  
  /**
   *        
   */
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
