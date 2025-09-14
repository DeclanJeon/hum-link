import { create } from 'zustand';

export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
}

interface ChatState {
  messages: Message[];
  newMessage: string;
}

interface ChatActions {
  setNewMessage: (message: string) => void;
  sendMessage: () => void;
  addToWhiteboard: (message: Message, toast: any) => void;
  reset: () => void;
}

const initialMessages: Message[] = [
  {
    id: "1",
    text: "Hey! Great to connect with you here.",
    sender: "Remote Participant",
    timestamp: new Date(Date.now() - 300000),
    isOwn: false
  },
  {
    id: "2", 
    text: "Absolutely! This interface feels really smooth.",
    sender: "You",
    timestamp: new Date(Date.now() - 240000),
    isOwn: true
  }
];

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  messages: initialMessages,
  newMessage: "",

  setNewMessage: (message: string) => set({ newMessage: message }),

  sendMessage: () => {
    const { newMessage, messages } = get();
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(),
      text: newMessage.trim(),
      sender: "You",
      timestamp: new Date(),
      isOwn: true
    };

    set({ 
      messages: [...messages, message],
      newMessage: "" 
    });

    // Simulate response after a delay
    setTimeout(() => {
      const responses = [
        "That's a great point!",
        "I totally agree with that.",
        "Let me think about that for a moment.",
        "Interesting perspective!",
        "Could you elaborate on that?"
      ];
      
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: responses[Math.floor(Math.random() * responses.length)],
        sender: "Remote Participant",
        timestamp: new Date(),
        isOwn: false
      };
      
      set({ messages: [...get().messages, response] });
    }, 1000 + Math.random() * 2000);
  },

  addToWhiteboard: (message: Message, toast: any) => {
    toast.success("Message added to whiteboard!");
    // In real implementation, this would integrate with whiteboard state
  },

  reset: () => set({ messages: initialMessages, newMessage: "" })
}));