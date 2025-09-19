import { create } from 'zustand';
import { produce } from 'immer';

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderNickname: string;
  timestamp: number;
}

interface ChatState {
  chatMessages: ChatMessage[];
  isTyping: Map<string, string>; // userId -> nickname
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  setTypingState: (userId: string, nickname: string, isTyping: boolean) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  chatMessages: [],
  isTyping: new Map(),

  addMessage: (message) =>
    set(
      produce((state: ChatState) => {
        // 중복 메시지 방지
        if (!state.chatMessages.some((msg) => msg.id === message.id)) {
          state.chatMessages.push(message);
        }
      }),
    ),

  setTypingState: (userId, nickname, isTyping) =>
    set(
      produce((state: ChatState) => {
        if (isTyping) {
          state.isTyping.set(userId, nickname);
        } else {
          state.isTyping.delete(userId);
        }
      }),
    ),
  
  clearChat: () => set({ chatMessages: [], isTyping: new Map() }),
}));
