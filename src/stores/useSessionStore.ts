import { create } from 'zustand';
import { produce } from 'immer';

interface SessionState {
  userId: string | null;
  nickname: string | null;
  roomId: string | null;
  isActiveSession: boolean;
  sessionStartTime: number | null;
}

interface SessionActions {
  setSession: (userId: string, nickname: string, roomId: string) => void;
  updateNickname: (nickname: string) => void;
  clearSession: () => void;
  getSessionInfo: () => { userId: string; nickname: string } | null;
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  userId: null,
  nickname: null,
  roomId: null,
  isActiveSession: false,
  sessionStartTime: null,

  setSession: (userId: string, nickname: string, roomId: string) => {
    set({
      userId,
      nickname,
      roomId,
      isActiveSession: true,
      sessionStartTime: Date.now()
    });
    console.log(`[Session] Session started - User: ${nickname} (${userId}) in room: ${roomId}`);
  },

  updateNickname: (nickname: string) => {
    set(produce((state: SessionState) => {
      state.nickname = nickname;
    }));
  },

  clearSession: () => {
    const state = get();
    if (state.isActiveSession) {
      console.log(`[Session] Session ended - User: ${state.nickname} (${state.userId})`);
    }
    set({
      userId: null,
      nickname: null,
      roomId: null,
      isActiveSession: false,
      sessionStartTime: null
    });
  },

  getSessionInfo: () => {
    const state = get();
    if (state.userId && state.nickname) {
      return { userId: state.userId, nickname: state.nickname };
    }
    return null;
  }
}));