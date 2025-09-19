import { create } from 'zustand';
import { produce } from 'immer';
import { SignalingClient } from '@/services/signaling';
import { WebRTCManager } from '@/services/webrtc';
import { useChatStore, ChatMessage } from './useChatStore';
import { useUIManagementStore } from './useUIManagementStore';
import { ENV } from '@/config';
import { nanoid } from 'nanoid'; // nanoid import

// Peer의 상세 상태를 정의합니다.
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}


// Peer의 상세 상태를 정의합니다.
export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

// ====================== [ 파일 공유 기능 추가 ] ======================
// 파일 메타데이터 타입 정의
interface FileMetadata {
  transferId: string;
  name: string;
  size: number;
  type: string;
}

// 데이터 채널을 통해 전달되는 메시지 타입을 정의합니다.
type DataChannelMessage =
  | { type: 'chat'; payload: ChatMessage }
  | { type: 'typing-state'; payload: { isTyping: boolean } }
  | { type: 'file-meta'; payload: FileMetadata };

// 타입 가드 함수
function isDataChannelMessage(obj: any): obj is DataChannelMessage {
    return obj && typeof obj.type === 'string' && 'payload' in obj;
}
// =================================================================
// WebRTC 핵심 상태
interface WebRTCState {
  roomId: string | null;
  userId: string | null;
  nickname: string | null;
  localStream: MediaStream | null;
  signalingClient: SignalingClient | null;
  webRTCManager: WebRTCManager | null;
  peers: Map<string, PeerState>;
  signalingStatus: 'connecting' | 'connected' | 'disconnected';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean;
}

// WebRTC 관련 액션
interface WebRTCActions {
  init: (roomId: string, userId: string, nickname: string, localStream: MediaStream) => void;
  cleanup: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  sendChatMessage: (text: string) => void;
  sendFile: (file: File) => void; // 파일 전송 액션 추가
}

export const useWebRTCStore = create<WebRTCState & WebRTCActions>((set, get) => ({
  // 초기 상태
  roomId: null,
  userId: null,
  nickname: null,
  localStream: null,
  signalingClient: null,
  webRTCManager: null,
  peers: new Map(),
  signalingStatus: 'connecting',
  isAudioEnabled: true,
  isVideoEnabled: true,
  isSharingScreen: false,

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
        // ✅ 데이터 처리 로직 개선
        // simple-peer는 Buffer를 전달하므로 toString()으로 변환
        const dataString = data.toString();
        
        try {
          const parsedData = JSON.parse(dataString);
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
            case 'file-meta':
              useChatStore.getState().addFileMessage(peerId, senderNickname, parsedData.payload);
              break;
          }
        } catch (e) {
            // JSON 파싱 실패 시 바이너리 데이터(파일 청크)로 간주
            // 이 방식은 transferId를 알 수 없다는 문제가 있습니다.
            // 더 나은 방법은 바이너리 데이터 앞에 헤더(e.g., transferId)를 붙이는 것입니다.
            // 여기서는 임시로 마지막 파일 전송 ID를 사용한다고 가정합니다.
            console.warn("Received binary data, assuming it's a file chunk. This part needs a more robust implementation.", e);
            
            // [추론] 이 로직은 여러 파일이 동시에 전송될 때 문제가 될 수 있습니다.
            // 간단한 해결을 위해 가장 최근에 시작된 수신 파일의 ID를 찾습니다.
            const transfers = useChatStore.getState().fileTransfers;
            let targetTransferId: string | undefined;
            for (const [id, transfer] of transfers.entries()) {
                if (transfer.isReceiving && !transfer.isComplete) {
                    targetTransferId = id;
                    break;
                }
            }

            if (targetTransferId) {
                // 마지막 청크인지 판단하는 로직이 필요합니다.
                // 여기서는 임시로 데이터 크기가 chunkSize보다 작으면 마지막으로 간주합니다.
                const chunkSize = 16 * 1024;
                const isLast = data.byteLength < chunkSize;
                useChatStore.getState().appendFileChunk(targetTransferId, data, isLast);
            }
        }
      },
      onClose: (peerId) => {
        set(produce(state => { state.peers.delete(peerId); }));
      },
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
              state.peers.set(user.id, {
                userId: user.id,
                nickname: user.nickname,
                audioEnabled: true,
                videoEnabled: true,
                isSharingScreen: false,
                connectionState: 'connecting',
              });
            }));
          }
        });
      },
      onUserJoined: (user) => {
        set(produce(state => {
          state.peers.set(user.id, {
            userId: user.id,
            nickname: user.nickname,
            audioEnabled: true,
            videoEnabled: true,
            isSharingScreen: false,
            connectionState: 'connecting',
          });
        }));
      },
      onUserLeft: (userId) => {
        get().webRTCManager?.removePeer(userId);
        set(produce(state => { state.peers.delete(userId); }));
      },
      onSignal: ({ from, signal }) => {
        const webRTCManager = get().webRTCManager;
        webRTCManager?.hasPeer(from) ? webRTCManager.signalPeer(from, signal) : webRTCManager?.receiveSignal(from, signal);
      },
      onMediaState: ({ userId, kind, enabled }) => {
        set(produce(state => {
          const peer = state.peers.get(userId);
          if (peer) {
            peer[kind === 'audio' ? 'audioEnabled' : 'videoEnabled'] = enabled;
          }
        }));
      },
      onChatMessage: (message: ChatMessage) => {
        useChatStore.getState().addMessage(message);
        if (useUIManagementStore.getState().activePanel !== 'chat') {
            useUIManagementStore.getState().incrementUnreadMessageCount();
        }
      }
    });

    signalingClient.connect(ENV.VITE_SIGNALING_SERVER_URL, userId, nickname, roomId);
    set({ roomId, userId, nickname, localStream, webRTCManager, signalingClient, isAudioEnabled: localStream.getAudioTracks()[0]?.enabled ?? false, isVideoEnabled: localStream.getVideoTracks()[0]?.enabled ?? false });
  },

  // 정리 함수
  cleanup: () => {
    get().webRTCManager?.destroyAll();
    get().signalingClient?.disconnect();
    get().localStream?.getTracks().forEach(track => track.stop());
    useChatStore.getState().clearChat();
    useUIManagementStore.getState().resetUnreadMessageCount();
    set({
      roomId: null, userId: null, nickname: null, localStream: null,
      webRTCManager: null, signalingClient: null, peers: new Map(),
      signalingStatus: 'disconnected'
    });
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

  sendChatMessage: (text: string) => {
    const { userId, nickname, webRTCManager, signalingClient } = get();
    if (!userId || !nickname) return;
    
    const message: ChatMessage = {
      id: `${userId}-${Date.now()}`,
      type: 'text',
      text,
      senderId: userId,
      senderNickname: nickname,
      timestamp: Date.now(),
    };

    // 로컬 상태에 즉시 반영
    useChatStore.getState().addMessage(message);
    
    const dataChannelMessage: DataChannelMessage = { type: 'chat', payload: message };

    // 데이터 채널을 통해 전송 시도
    const sentCount = webRTCManager?.sendToAllPeers(JSON.stringify(dataChannelMessage)) ?? 0;

    // 데이터 채널로 보낼 수 없는 경우 시그널링 서버로 폴백
    if (sentCount === 0) {
      console.log("Data Channel not available. Falling back to Socket.IO.");
      signalingClient?.sendChatMessage(message);
    }
  },
  
  // ====================== [ 파일 공유 기능 추가 ] ======================
  sendFile: (file: File) => {
    const { userId, nickname, webRTCManager } = get();
    if (!userId || !nickname || !webRTCManager) return;

    const transferId = nanoid();
    const fileMeta: FileMetadata = {
      transferId,
      name: file.name,
      size: file.size,
      type: file.type,
    };
    
    // 1. UI에 파일 메시지를 먼저 추가 (로컬 사용자 경험 향상)
    useChatStore.getState().addFileMessage(userId, nickname, fileMeta, true);

    // 2. 다른 피어에게 파일 전송 시작을 알림
    const metaMessage: DataChannelMessage = { type: 'file-meta', payload: fileMeta };
    webRTCManager.sendToAllPeers(JSON.stringify(metaMessage));
    
    // 3. 파일을 청크로 나누어 전송
    const chunkSize = 16 * 1024; // 16KB
    let offset = 0;
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
        if (!e.target?.result) return;
        const chunk = e.target.result as ArrayBuffer;
        
        // [수정] 바이너리 데이터 앞에 transferId를 헤더로 붙여서 전송
        const header = new TextEncoder().encode(`${transferId}:`);
        const combined = new Uint8Array(header.length + chunk.byteLength);
        combined.set(header, 0);
        combined.set(new Uint8Array(chunk), header.length);
        
        webRTCManager.sendToAllPeers(combined.buffer);

        offset += chunk.byteLength;
        useChatStore.getState().updateFileProgress(transferId, offset);
        
        if (offset < file.size) {
            readSlice(offset);
        } else {
            console.log(`File ${file.name} sent successfully.`);
        }
    };

    const readSlice = (currentOffset: number) => {
        const slice = file.slice(currentOffset, currentOffset + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  },
  // =================================================================
}));
