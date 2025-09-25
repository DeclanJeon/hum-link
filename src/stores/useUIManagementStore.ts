import { create } from 'zustand';

export type ActivePanel = 'chat' | 'whiteboard' | 'settings' | 'fileStreaming' | 'none';
export type ViewMode = 'speaker' | 'grid';

interface UIManagementState {
  activePanel: ActivePanel;
  showControls: boolean;
  viewMode: ViewMode;
  unreadMessageCount: number;
}

interface UIManagementActions {
  setActivePanel: (panel: ActivePanel) => void;
  setShowControls: (show: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  incrementUnreadMessageCount: () => void;
  resetUnreadMessageCount: () => void;
  reset: () => void;
}

export const useUIManagementStore = create<UIManagementState & UIManagementActions>((set, get) => ({
  activePanel: 'none',
  showControls: true,
  viewMode: 'speaker',
  unreadMessageCount: 0,

  setActivePanel: (panel) => {
    const currentPanel = get().activePanel;
    const newPanel = currentPanel === panel ? 'none' : panel;
    
    // 채팅 패널이 열릴 때 읽지 않은 메시지 수를 초기화합니다.
    if (newPanel === 'chat') {
      get().resetUnreadMessageCount();
    }
    
    set({ activePanel: newPanel });
  },

  setShowControls: (show) => set({ showControls: show }),
  
  setViewMode: (mode) => set({ viewMode: mode }),

  incrementUnreadMessageCount: () => set((state) => ({ unreadMessageCount: state.unreadMessageCount + 1 })),

  resetUnreadMessageCount: () => set({ unreadMessageCount: 0 }),

  reset: () => set({
    activePanel: 'none',
    showControls: true,
    viewMode: 'speaker',
    unreadMessageCount: 0,
  }),
}));
