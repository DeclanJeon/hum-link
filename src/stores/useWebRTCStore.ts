import { create } from 'zustand';
import { produce } from 'immer';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { useChatStore, ChatMessage, FileMetadata } from './useChatStore';
import { useUIManagementStore } from './useUIManagementStore';
import { ENV } from '@/config';
import { nanoid } from 'nanoid';

// [수정] Peer의 상태에 자막 정보 추가
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  transcript?: { text: string; isFinal: boolean; lang: string }; // [추가] 상대방의 자막 정보
}

// [수정] DataChannel 메시지 타입에 자막 추가
type DataChannelMessage =
  | { type: 'chat'; payload: ChatMessage }
  | { type: 'typing-state'; payload: { isTyping: boolean } }
  | { type: 'whiteboard-event'; payload: any }
  | { type: 'file-meta'; payload: FileMetadata }
  | { type: 'file-chunk'; payload: { transferId: string; chunk: number[]; isLast: boolean } }
  | { type: 'transcription'; payload: { text: string; isFinal: boolean; lang: string } }; // [추가]

function isDataChannelMessage(obj: any): obj is DataChannelMessage {
    return obj && typeof obj.type === 'string' && 'payload' in obj;
}

// [수정] WebRTC 상태 인터페이스 확장
interface WebRTCState {
  roomId: string | null;
  userId: string | null;
  nickname: string | null;
  localStream: MediaStream | null;
  originalVideoTrack: MediaStreamTrack | null;
  signalingClient: SignalingClient | null;
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
  signalingStatus: 'connecting' | 'connected' | 'disconnected';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
  preShareVideoState: boolean | null;
  isTranscriptionEnabled: boolean; // [추가]
  transcriptionLanguage: string; // [추가] 내 발화 언어
  translationTargetLanguage: string; // [추가] 번역 목표 언어
  localTranscript: { text: string; isFinal: boolean }; // [추가] 내 자막
}

// [수정] WebRTC 액션 인터페이스 확장
interface WebRTCActions {
  init: (roomId: string, userId: string, nickname: string, localStream: MediaStream) => void;
  cleanup: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: (toast: any) => Promise<void>;
  sendChatMessage: (text: string) => void;
  sendTypingState: (isTyping: boolean) => void;
  sendWhiteboardData: (data: any) => void;
  sendFile: (file: File) => void;
  toggleTranscription: () => void; // [추가]
  setTranscriptionLanguage: (lang: string) => void; // [추가]
  setTranslationTargetLanguage: (lang: string) => void; // [추가]
  setLocalTranscript: (transcript: { text: string; isFinal: boolean }) => void; // [추가]
  sendTranscription: (text: string, isFinal: boolean) => void; // [추가]
}

export const useWebRTCStore = create<WebRTCState & WebRTCActions>((set, get) => ({
  // 초기 상태
  roomId: null,
  userId: null,
  nickname: null,
  localStream: null,
  originalVideoTrack: null,
  signalingClient: null,
  webRTCManager: null,
  peers: new Map(),
  signalingStatus: 'connecting',
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,
  preShareVideoState: null, // [개선] 초기값 설정
  // ... 기존 초기 상태
  isTranscriptionEnabled: false,
  transcriptionLanguage: 'en-US',
  translationTargetLanguage: 'none',
  localTranscript: { text: '', isFinal: false },

  // 초기화 함수
  init: (roomId, userId, nickname, localStream) => {
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => get().signalingClient?.sendSignal(peerId, signal),
      onConnect: (peerId) => {
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'connected';
        }));
        console.log(`[WebRTC] DataChannel connected with ${peerId}`);
      },
      onStream: (peerId, stream) => {
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) peer.stream = stream;
        }));
      },
      onData: (peerId, data) => {
        try {
          const parsedData = JSON.parse(data.toString());
          if (!isDataChannelMessage(parsedData)) return;

          const sender = get().peers.get(peerId);
          const senderNickname = sender ? sender.nickname : "Unknown";

          switch (parsedData.type) {
            case 'chat':
              useChatStore.getState().addMessage(parsedData.payload);
              if (useUIManagementStore.getState().activePanel !== 'chat') {
                useUIManagementStore.getState().incrementUnreadMessageCount();
              }
              break;
            case 'typing-state':
              if (sender) {
                useChatStore.getState().setTypingState(peerId, sender.nickname, parsedData.payload.isTyping);
              }
              break;
            case 'whiteboard-event':
              // 화이트보드 스토어에 원격 드로우 이벤트를 적용합니다.
              useChatStore.getState().applyRemoteDrawEvent(parsedData.payload);
              break;
            case 'file-meta':
              useChatStore.getState().addFileMessage(peerId, senderNickname, parsedData.payload);
              break;
            case 'file-chunk':
              // 구조화된 청크 데이터를 처리합니다.
              const { transferId, chunk, isLast } = parsedData.payload;
              const buffer = new Uint8Array(chunk).buffer;
              useChatStore.getState().appendFileChunk(transferId, buffer, isLast);
              break;
            case 'transcription': // [추가] 자막 데이터 수신 처리
              set(produce(state => {
                const peer = state.peers.get(peerId);
                if (peer) {
                  peer.transcript = parsedData.payload;
                }
              }));
              break;
          }
        } catch (e) {
            console.error("Failed to process DataChannel message:", e);
        }
      },
      onClose: (peerId) => set(produce(state => { state.peers.delete(peerId); })),
      onError: (peerId, error) => {
        console.error(`[WebRTC] Error with peer ${peerId}:`, error);
        set(produce(state => { 
          const peer = state.peers.get(peerId);
          if (peer) peer.connectionState = 'failed';
        }));
      },
    });

    const signalingClient = new SignalingClient({
      onConnect: () => set({ signalingStatus: 'connected' }),
      onDisconnect: () => set({ signalingStatus: 'disconnected' }),
      onRoomUsers: (users) => {
        users.forEach(user => {
          if (user.id !== get().userId) {
            get().webRTCManager?.createPeer(user.id);
            set(produce(state => {
              state.peers.set(user.id, { userId: user.id, nickname: user.nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' });
            }));
          }
        });
      },
      onUserJoined: (user) => set(produce(state => { state.peers.set(user.id, { userId: user.id, nickname: user.nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' }); })),
      onUserLeft: (userId) => {
        get().webRTCManager?.removePeer(userId);
        set(produce(state => { state.peers.delete(userId); }));
      },
      onSignal: ({ from, signal }) => {
        const rtcManager = get().webRTCManager;
        rtcManager?.hasPeer(from) ? rtcManager.signalPeer(from, signal) : rtcManager?.receiveSignal(from, signal);
      },
      onMediaState: ({ userId, kind, enabled }) => set(produce(state => {
        const peer = state.peers.get(userId);
        if (peer) {
          if (kind === 'audio') peer.audioEnabled = enabled;
          else if (kind === 'video') peer.videoEnabled = enabled;
        }
      })),
      onChatMessage: (message) => { /* DataChannel fallback - 현재는 사용하지 않음 */ },
    });

    signalingClient.connect(ENV.VITE_SIGNALING_SERVER_URL, userId, nickname, roomId);
    set({ roomId, userId, nickname, localStream, webRTCManager, signalingClient, isAudioEnabled: localStream.getAudioTracks()[0]?.enabled ?? false, isVideoEnabled: localStream.getVideoTracks()[0]?.enabled ?? false });
  },

  cleanup: () => {
    get().webRTCManager?.destroyAll();
    get().signalingClient?.disconnect();
    get().localStream?.getTracks().forEach(track => track.stop());
    get().originalVideoTrack?.stop(); // 저장된 비디오 트랙도 정리
    useChatStore.getState().clearChat();
    useUIManagementStore.getState().resetUnreadMessageCount();
    set({ roomId: null, userId: null, nickname: null, localStream: null, originalVideoTrack: null, webRTCManager: null, signalingClient: null, peers: new Map(), signalingStatus: 'disconnected' });
  },

  toggleAudio: () => {
    const enabled = !get().isAudioEnabled;
    get().localStream?.getAudioTracks().forEach(track => track.enabled = enabled);
    get().signalingClient?.updateMediaState('audio', enabled);
    set({ isAudioEnabled: enabled });
  },

  toggleVideo: () => {
    const enabled = !get().isVideoEnabled;
    if (!get().isSharingScreen) {
      get().localStream?.getVideoTracks().forEach(track => track.enabled = enabled);
      get().signalingClient?.updateMediaState('video', enabled);
    }
    set({ isVideoEnabled: enabled });
  },

  toggleScreenShare: async (toast: any) => {
    const { isSharingScreen, webRTCManager, localStream, originalVideoTrack, isVideoEnabled, preShareVideoState } = get();

    if (isSharingScreen) {
      // --- 화면 공유 중지 로직 ---
      if (originalVideoTrack && localStream) {
        const screenTrack = localStream.getVideoTracks()[0];
        
        // [개선] 원격 피어와 로컬 스트림 모두 원래 트랙으로 복원
        webRTCManager?.replaceTrack(screenTrack, originalVideoTrack);
        localStream.removeTrack(screenTrack);
        localStream.addTrack(originalVideoTrack);
        screenTrack.stop();

        // [개선] 공유 시작 전 비디오 상태로 복원. null이면 false로 간주.
        const wasVideoEnabledBeforeShare = preShareVideoState ?? false;
        originalVideoTrack.enabled = wasVideoEnabledBeforeShare;

        set({
          isSharingScreen: false,
          originalVideoTrack: null,
          isVideoEnabled: wasVideoEnabledBeforeShare, // [개선] 저장된 상태로 설정
          preShareVideoState: null, // [개선] 상태 초기화
        });
        
        // [개선] 복원된 실제 상태를 다른 참여자에게 알림
        get().signalingClient?.updateMediaState('video', wasVideoEnabledBeforeShare);
        toast.info("Screen sharing has ended.");
      }
    } else {
      // --- 화면 공유 시작 로직 ---
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (localStream && webRTCManager) {
          const currentVideoTrack = localStream.getVideoTracks()[0];
          
          // [개선] 공유 시작 전 상태 저장
          set({
            originalVideoTrack: currentVideoTrack,
            preShareVideoState: isVideoEnabled
          });

          // [개선] 원격 피어와 로컬 스트림 모두 화면 공유 트랙으로 교체
          webRTCManager.replaceTrack(currentVideoTrack, screenTrack);
          localStream.removeTrack(currentVideoTrack);
          localStream.addTrack(screenTrack);
          
          set({ isSharingScreen: true, isVideoEnabled: true });
          get().signalingClient?.updateMediaState('video', true); // 공유 시작 시에는 항상 비디오 on
          
          // 사용자가 브라우저 UI로 공유를 중지했을 때 처리
          screenTrack.onended = () => {
            // isSharingScreen 상태를 다시 확인하여 중복 실행 방지
            if (get().isSharingScreen) {
              get().toggleScreenShare(toast);
            }
          };
          
          toast.success("Started screen sharing.");
        }
      } catch (error) {
        console.error("Screen share error:", error);
        toast.error("Could not start screen sharing. Permission may have been denied.");
      }
    }
  },

  sendChatMessage: (text: string) => {
    const { userId, nickname, webRTCManager } = get();
    if (!userId || !nickname || !webRTCManager) return;
    
    const message: ChatMessage = { id: nanoid(), type: 'text', text, senderId: userId, senderNickname: nickname, timestamp: Date.now() };
    useChatStore.getState().addMessage(message);
    const data: DataChannelMessage = { type: 'chat', payload: message };
    webRTCManager.sendToAllPeers(JSON.stringify(data));
  },

  sendTypingState: (isTyping: boolean) => {
    const data: DataChannelMessage = { type: 'typing-state', payload: { isTyping } };
    get().webRTCManager?.sendToAllPeers(JSON.stringify(data));
  },

  sendWhiteboardData: (eventData: any) => {
    const data: DataChannelMessage = { type: 'whiteboard-event', payload: eventData };
    get().webRTCManager?.sendToAllPeers(JSON.stringify(data));
  },

  sendFile: (file: File) => {
    const { userId, nickname, webRTCManager } = get();
    if (!userId || !nickname || !webRTCManager) return;

    const transferId = nanoid();
    const fileMeta: FileMetadata = { transferId, name: file.name, size: file.size, type: file.type };
    
    useChatStore.getState().addFileMessage(userId, nickname, fileMeta, true);
    
    const metaMessage: DataChannelMessage = { type: 'file-meta', payload: fileMeta };
    webRTCManager.sendToAllPeers(JSON.stringify(metaMessage));
    
    const chunkSize = 16 * 1024; // 16KB
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) return;
      const chunk = e.target.result as ArrayBuffer;
      
      const chunkMessage: DataChannelMessage = {
        type: 'file-chunk',
        payload: {
          transferId,
          chunk: Array.from(new Uint8Array(chunk)), // ArrayBuffer를 숫자 배열로 변환
          isLast: offset + chunk.byteLength >= file.size,
        },
      };
      webRTCManager.sendToAllPeers(JSON.stringify(chunkMessage));

      offset += chunk.byteLength;
      useChatStore.getState().updateFileProgress(transferId, offset);
      
      if (offset < file.size) {
        readSlice(offset);
      }
    };
    const readSlice = (o: number) => reader.readAsArrayBuffer(file.slice(o, o + chunkSize));
    readSlice(0);
  },

  // [추가] 자막 기능 토글
  toggleTranscription: () => set((state) => ({ isTranscriptionEnabled: !state.isTranscriptionEnabled })),

  // [추가] 발화 언어 설정
  setTranscriptionLanguage: (lang) => set({ transcriptionLanguage: lang }),

  // [추가] 번역 목표 언어 설정
  setTranslationTargetLanguage: (lang) => set({ translationTargetLanguage: lang }),

  // [추가] 내 화면에 표시될 자막 설정
 setLocalTranscript: (transcript) => set({ localTranscript: transcript }),

  // [추가] 자막 데이터 전송
  sendTranscription: (text, isFinal) => {
    const { webRTCManager, transcriptionLanguage } = get();
    const data: DataChannelMessage = {
      type: 'transcription',
      payload: { text, isFinal, lang: transcriptionLanguage },
    };
    webRTCManager?.sendToAllPeers(JSON.stringify(data));
  },
}));
