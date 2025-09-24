import { create } from 'zustand';
import { produce } from 'immer';
import { io, Socket } from 'socket.io-client';
import { SignalData } from 'simple-peer';
import { ENV } from '@/config';
import { ChatMessage } from './useChatStore';

type SignalingStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface PeerInfo {
  id: string;
  nickname: string;
}

interface SignalingEvents {
  onConnect: () => void;
  onDisconnect: () => void;
  onRoomUsers: (users: PeerInfo[]) => void;
  onUserJoined: (user: PeerInfo) => void;
  onUserLeft: (userId: string) => void;
  onSignal: (data: { from: string; signal: SignalData }) => void;
  onMediaState: (data: { userId: string; kind: 'audio' | 'video'; enabled: boolean }) => void;
  onChatMessage: (message: ChatMessage) => void;
  onData: (data: any) => void;
}

interface SignalingState {
  socket: Socket | null;
  status: SignalingStatus;
}

interface SignalingActions {
  connect: (roomId: string, userId: string, nickname: string, events: SignalingEvents) => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  sendSignal: (to: string, data: any) => void;
  updateMediaState: (data: { kind: 'audio' | 'video'; enabled: boolean }) => void;
}

export const useSignalingStore = create<SignalingState & SignalingActions>((set, get) => ({
  socket: null,
  status: 'disconnected',

  connect: (roomId, userId, nickname, events) => {
    if (get().socket) return;

    set({ status: 'connecting' });
    const socket = io(ENV.VITE_SIGNALING_SERVER_URL);

    socket.on('connect', () => {
      set({ status: 'connected' });
      events.onConnect();
      console.log(`[SIGNALING_CORE] join-room 이벤트 전송: { roomId: ${roomId}, userId: ${userId} }`);
      socket.emit('join-room', { roomId, userId, nickname });
    });

    socket.on('disconnect', () => {
      set({ status: 'disconnected' });
      events.onDisconnect();
    });

    // ✅ 추가: 연결 오류 리스너
    socket.on('connect_error', (err) => {
      console.error('[SIGNALING_CORE] ❌ 연결 오류:', err.message);
      set({ status: 'error' });
    });

    // ✅ 추가: 일반 소켓 오류 리스너
    socket.on('error', (err) => {
      console.error('[SIGNALING_CORE] ❌ 소켓 오류:', err);
    });

    // ✅ 수정: 백엔드의 멀티플렉싱 방식에 맞춰 단일 'message' 이벤트 리스너로 통합
    socket.on('message', (data: { type: string; from: string; [key: string]: any }) => {
      console.log(`[SIGNALING_CORE] 📥 [message] 이벤트 수신:`, data);
      switch (data.type) {
        case 'signal':
          events.onSignal({ from: data.from, signal: data.data });
          break;
        case 'peer-state-updated':
          events.onMediaState({ userId: data.from, ...data.data });
          break;
        case 'chat':
          events.onChatMessage(data as unknown as ChatMessage);
          break;
        case 'file-meta':
        case 'file-accept':
        case 'file-decline':
        case 'file-cancel':
        case 'file-chunk':
          events.onData(data);
          break;
        default:
          console.warn(`[Signaling] Unknown message type received: ${data.type}`);
          break;
      }
    });

    socket.on('room-users', (users) => {
        console.log(`[SIGNALING_CORE] 📥 [room-users] 이벤트 수신:`, users);
        events.onRoomUsers(users);
    });
    socket.on('user-joined', (user) => {
        console.log(`[SIGNALING_CORE] 📥 [user-joined] 이벤트 수신:`, user);
        events.onUserJoined(user);
    });
    socket.on('user-left', (userId) => {
        console.log(`[SIGNALING_CORE] 📥 [user-left] 이벤트 수신:`, userId);
        events.onUserLeft(userId);
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, status: 'disconnected' });
  },

  emit: (event, data) => {
    console.log(`[SIGNALING_CORE] 📡 [${event}] 이벤트 전송:`, data);
    get().socket?.emit(event, data);
  },

  sendSignal: (to, data) => {
    get().emit('message', { type: 'signal', to, data });
  },

  updateMediaState: (data) => {
    get().emit('message', { type: 'media-state-update', data });
  },
}));