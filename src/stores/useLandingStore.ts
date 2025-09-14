import { create } from 'zustand';

interface LandingState {
  roomTitle: string;
  nickname: string;
}

interface LandingActions {
  setRoomTitle: (title: string) => void;
  setNickname: (nickname: string) => void;
  generateRandomNickname: () => string;
  handleConnect: (navigate: (path: string) => void, toast: any) => void;
  reset: () => void;
}

export const useLandingStore = create<LandingState & LandingActions>((set, get) => ({
  roomTitle: "",
  nickname: "",

  setRoomTitle: (title: string) => set({ roomTitle: title }),
  
  setNickname: (nickname: string) => set({ nickname }),

  generateRandomNickname: () => {
    const adjectives = ["Brilliant", "Curious", "Radiant", "Wandering", "Inspiring", "Creative", "Thoughtful", "Dynamic"];
    const nouns = ["Explorer", "Innovator", "Dreamer", "Architect", "Visionary", "Creator", "Pioneer", "Builder"];
    
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    
    const generatedName = `${randomAdjective} ${randomNoun}`;
    set({ nickname: generatedName });
    return generatedName;
  },

  handleConnect: (navigate: (path: string) => void, toast: any) => {
    const { roomTitle, nickname } = get();
    
    if (!roomTitle.trim()) {
      toast.error("Please enter a room title to continue");
      return;
    }

    const finalNickname = nickname.trim() || get().generateRandomNickname();
    
    // Store connection details for the lobby
    sessionStorage.setItem("connectionDetails", JSON.stringify({
      roomTitle: roomTitle.trim(),
      nickname: finalNickname
    }));

    toast.success(`Connecting as "${finalNickname}"...`);
    navigate("/lobby");
  },

  reset: () => set({ roomTitle: "", nickname: "" })
}));