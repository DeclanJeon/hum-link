import { create } from 'zustand';
import nicknamesData from '@/data/nicknames.json';

interface LandingState {
  roomTitle: string;
  nickname: string;
}

interface LandingActions {
  setRoomTitle: (title: string) => void;
  setNickname: (nickname: string) => void;
  generateRandomNickname: () => string;
  handleConnect: (navigate: (path: string, options?: { state: any }) => void, toast: any) => void;
  reset: () => void;
}

export const useLandingStore = create<LandingState & LandingActions>((set, get) => ({
  roomTitle: "",
  nickname: "",

  setRoomTitle: (title: string) => set({ roomTitle: title }),
  
  setNickname: (nickname: string) => set({ nickname }),

  generateRandomNickname: () => {
    const { adjectives, animals } = nicknamesData; // <-- 'nouns' 대신 'animals'를 불러옵니다!
    
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    
    const generatedName = `${randomAdjective} ${randomAnimal}`;
    set({ nickname: generatedName });
    return generatedName;
  },

  // 변경: sessionStorage를 제거하고, react-router의 state를 통해 닉네임을 전달합니다.
  // 방 제목은 URL 파라미터로 전달합니다.
  handleConnect: (navigate, toast) => {
    const { roomTitle, nickname } = get();
    
    if (!roomTitle.trim()) {
      toast.error("Please enter a room title to continue");
      return;
    }

    const finalNickname = nickname.trim() || get().generateRandomNickname();
    
    toast.success(`Preparing to join as "${finalNickname}"...`);
    
    // URL에 방 제목을 포함하고, state에 닉네임을 담아 Lobby로 이동합니다.
    navigate(`/lobby/${encodeURIComponent(roomTitle.trim())}`, { 
      state: { nickname: finalNickname } 
    });
  },

  reset: () => set({ roomTitle: "", nickname: "" })
}));
