/**
 * @fileoverview Lobby 상태 관리 (재설계)
 * @module stores/useLobbyStore
 */

import { create } from 'zustand';
import { useMediaDeviceStore } from './useMediaDeviceStore';
import { deviceManager } from '@/services/deviceManager';
import nicknamesData from '@/data/nicknames.json';
import { toast } from 'sonner';

interface ConnectionDetails {
  roomTitle: string;
  nickname: string;
}

interface LobbyState {
  connectionDetails: ConnectionDetails | null;
  isInitialized: boolean;
}

interface LobbyActions {
  initialize: (roomTitle: string, nickname: string) => Promise<void>;
  cleanup: () => void;
}

/**
 * 랜덤 닉네임 생성
 */
const generateRandomNickname = (): string => {
  const { adjectives, animals } = nicknamesData;
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
  return `${randomAdjective} ${randomAnimal}`;
};

export const useLobbyStore = create<LobbyState & LobbyActions>((set, get) => ({
  connectionDetails: null,
  isInitialized: false,

  /**
   * 초기화
   */
  initialize: async (roomTitle: string, nickname: string) => {
    console.log('[LobbyStore] Initializing...');

    try {
      // 1. 닉네임 설정
      const finalNickname = nickname || generateRandomNickname();
      
      set({
        connectionDetails: {
          roomTitle: decodeURIComponent(roomTitle),
          nickname: finalNickname
        }
      });

      // 2. MediaDeviceStore 초기화
      await useMediaDeviceStore.getState().initialize();

      set({ isInitialized: true });

      console.log('[LobbyStore] Initialized successfully');
      toast.success('디바이스가 준비되었습니다!');
    } catch (error) {
      console.error('[LobbyStore] Initialization failed:', error);
      toast.error('초기화에 실패했습니다.');
    }
  },

  /**
   * 정리
   */
  cleanup: () => {
    // MediaDeviceStore는 Room으로 전달되므로 정리하지 않음
    set({
      connectionDetails: null,
      isInitialized: false
    });

    console.log('[LobbyStore] Cleaned up');
  }
}));
