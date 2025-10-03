import { create } from 'zustand';

export type ActivePanel = 'chat' | 'whiteboard' | 'settings' | 'fileStreaming' | 'none';
export type ViewMode = 'speaker' | 'grid';
export type ControlBarPosition = 'bottom' | 'left' | 'top' | 'right';
export type ControlBarSize = 'sm' | 'md' | 'lg';

interface UIManagementState {
  activePanel: ActivePanel;
  showControls: boolean;
  viewMode: ViewMode;
  unreadMessageCount: number;
  mainContentParticipantId: string | null;
  controlBarPosition: ControlBarPosition;
  isControlBarDragging: boolean;
  controlBarSize: ControlBarSize;
}

interface UIManagementActions {
  setActivePanel: (panel: ActivePanel) => void;
  setShowControls: (show: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  incrementUnreadMessageCount: () => void;
  resetUnreadMessageCount: () => void;
  setMainContentParticipant: (participantId: string | null) => void;
  setControlBarPosition: (position: ControlBarPosition) => void;
  setIsControlBarDragging: (isDragging: boolean) => void;
  setControlBarSize: (size: ControlBarSize) => void;
  reset: () => void;
}

export const useUIManagementStore = create<UIManagementState & UIManagementActions>((set, get) => ({
  activePanel: 'none',
  showControls: true,
  viewMode: 'speaker',
  unreadMessageCount: 0,
  mainContentParticipantId: null,
  controlBarPosition: 'bottom',
  isControlBarDragging: false,
  controlBarSize: 'md',

  setActivePanel: (panel) => {
    const currentPanel = get().activePanel;
    const newPanel = currentPanel === panel ? 'none' : panel;
    
    if (newPanel === 'chat') {
      get().resetUnreadMessageCount();
    }
    
    set({ activePanel: newPanel });
  },

  setShowControls: (show) => set({ showControls: show }),
  
  setViewMode: (mode) => set({ viewMode: mode }),

  incrementUnreadMessageCount: () => set((state) => ({ unreadMessageCount: state.unreadMessageCount + 1 })),

  resetUnreadMessageCount: () => set({ unreadMessageCount: 0 }),

  setMainContentParticipant: (participantId) => set({ mainContentParticipantId: participantId }),
  setControlBarPosition: (position) => set({ controlBarPosition: position }),
  setIsControlBarDragging: (isDragging) => set({ isControlBarDragging: isDragging }),
  setControlBarSize: (size) => set({ controlBarSize: size }),

  reset: () => set({
    activePanel: 'none',
    showControls: true,
    viewMode: 'speaker',
    unreadMessageCount: 0,
    mainContentParticipantId: null,
    controlBarPosition: 'bottom',
    isControlBarDragging: false,
    controlBarSize: 'md',
  }),
}));
