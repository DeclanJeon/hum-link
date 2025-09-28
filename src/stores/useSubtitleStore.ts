/**
 * @fileoverview 자막 Store - 자막 관리 및 동기화
 * @module stores/useSubtitleStore
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { SubtitleParser } from '@/lib/subtitle/parser';

/**
 * 자막 큐 인터페이스
 */
export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  style?: {
    color?: string;
    fontSize?: string;
    position?: { x: number; y: number };
  };
}

/**
 * 자막 트랙 인터페이스
 */
export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  cues: SubtitleCue[];
  format: 'srt' | 'vtt' | 'ass' | 'ssa';
  isDefault?: boolean;
}

/**
 * 자막 스타일 인터페이스
 */
export interface SubtitleStyle {
  fontFamily: string;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontWeight: 'normal' | 'bold';
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  edgeStyle: 'none' | 'dropshadow' | 'raised' | 'depressed' | 'uniform';
  edgeColor: string;
}

/**
 * 자막 Store 상태
 */
interface SubtitleState {
  // 로컬 자막 관련
  tracks: Map<string, SubtitleTrack>;
  activeTrackId: string | null;
  currentCue: SubtitleCue | null;
  nextCue: SubtitleCue | null;
  
  // 원격 자막 관련
  remoteTracks: Map<string, SubtitleTrack>;
  remoteActiveTrackId: string | null;
  remoteSubtitleCue: SubtitleCue | null;
  isRemoteSubtitleEnabled: boolean;
  
  // 동기화 설정
  syncOffset: number;
  speedMultiplier: number;
  isEnabled: boolean;
  
  // UI 설정
  position: 'top' | 'bottom' | 'custom';
  customPosition: { x: number; y: number };
  style: SubtitleStyle;
  
  // 검색
  searchQuery: string;
  searchResults: Array<{ cue: SubtitleCue; trackId: string }>;
}

/**
 * 자막 Store 액션
 */
interface SubtitleActions {
  // 로컬 자막 관리
  addTrack: (file: File) => Promise<void>;
  removeTrack: (trackId: string) => void;
  setActiveTrack: (trackId: string | null) => void;
  syncWithVideo: (currentTime: number) => void;
  
  // 원격 자막 관리
  syncWithRemoteVideo: (currentTime: number) => void;
  receiveSubtitleSync: (currentTime: number, cueId: string | null, trackId: string | null) => void;
  setRemoteSubtitleCue: (cue: SubtitleCue | null) => void;
  
  // 동기화 설정
  adjustSyncOffset: (delta: number) => void;
  setSpeedMultiplier: (speed: number) => void;
  updateStyle: (style: Partial<SubtitleStyle>) => void;
  setPosition: (position: 'top' | 'bottom' | 'custom') => void;
  
  // 검색 및 내보내기
  searchInSubtitles: (query: string) => void;
  jumpToCue: (cue: SubtitleCue) => void;
  exportSubtitle: (trackId: string, format: 'srt' | 'vtt') => Blob;
  
  // P2P 브로드캐스트
  broadcastTrack: (trackId: string) => void;
  receiveTrack: (track: SubtitleTrack) => void;
  broadcastSubtitleState: () => void;
  receiveSubtitleState: (state: Partial<SubtitleState>) => void;
  
  // Store 리셋
  reset: () => void;
}

/**
 * 자막 동기화 Store
 */
export const useSubtitleStore = create<SubtitleState & SubtitleActions>((set, get) => ({
  // 초기 상태
  tracks: new Map(),
  activeTrackId: null,
  currentCue: null,
  nextCue: null,
  
  remoteTracks: new Map(),
  remoteActiveTrackId: null,
  remoteSubtitleCue: null,
  isRemoteSubtitleEnabled: false,
  
  syncOffset: 0,
  speedMultiplier: 1.0,
  isEnabled: true,
  position: 'bottom',
  customPosition: { x: 50, y: 90 },
  style: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 'medium',
    fontWeight: 'normal',
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    edgeStyle: 'dropshadow',
    edgeColor: '#000000'
  },
  searchQuery: '',
  searchResults: [],

  /**
   * 로컬 자막 파일 추가
   */
  addTrack: async (file: File): Promise<void> => {
    try {
      if (!validateSubtitleFile(file)) {
        return;
      }

      const worker = new Worker(
        new URL('../workers/subtitle.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.postMessage({ type: 'parse', file });

      worker.onmessage = (event) => {
        const { type, payload } = event.data;
        
        if (type === 'parsed') {
          set(produce((state: SubtitleState) => {
            state.tracks.set(payload.track.id, payload.track);
            
            if (!state.activeTrackId) {
              state.activeTrackId = payload.track.id;
            }
          }));
          
          toast.success(`Subtitle loaded: ${payload.track.label}`);
          
          // 원격 피어에게 자막 트랙 브로드캐스트
          get().broadcastTrack(payload.track.id);
          
          worker.terminate();
        } else if (type === 'error') {
          toast.error(`Failed to parse subtitle: ${payload.error}`);
          worker.terminate();
        }
      };

      worker.onerror = (error) => {
        console.error('[SubtitleStore] Worker error:', error);
        toast.error('Failed to load subtitle file');
        worker.terminate();
      };
    } catch (error) {
      console.error('[SubtitleStore] Failed to add track:', error);
      toast.error('Failed to add subtitle track');
    }
  },

  /**
   * 자막 트랙 제거
   */
  removeTrack: (trackId: string): void => {
    set(produce((state: SubtitleState) => {
      state.tracks.delete(trackId);
      
      if (state.activeTrackId === trackId) {
        state.activeTrackId = null;
        state.currentCue = null;
        state.nextCue = null;
      }
    }));
  },

  /**
   * 활성 자막 트랙 설정
   */
  setActiveTrack: (trackId: string | null): void => {
    set(produce((state: SubtitleState) => {
      state.activeTrackId = trackId;
      state.currentCue = null;
      state.nextCue = null;
    }));
    
    // P2P 브로드캐스트
    get().broadcastSubtitleState();
  },

  /**
   * 로컬 비디오와 자막 동기화
   */
  syncWithVideo: (currentTime: number): void => {
    const { tracks, activeTrackId, syncOffset, speedMultiplier } = get();
    
    if (!activeTrackId) return;
    
    const track = tracks.get(activeTrackId);
    if (!track) return;
    
    const adjustedTime = currentTime + syncOffset;
    const scaledTime = adjustedTime * speedMultiplier;
    
    const currentCue = binarySearchCue(track.cues, scaledTime);
    const nextCue = findNextCue(track.cues, scaledTime);
    
    set({ currentCue, nextCue });
  },
  
  /**
   * 원격 비디오와 자막 동기화
   */
  syncWithRemoteVideo: (currentTime: number): void => {
    const { remoteTracks, remoteActiveTrackId, syncOffset, speedMultiplier } = get();
    
    if (!remoteActiveTrackId) return;
    
    const track = remoteTracks.get(remoteActiveTrackId);
    if (!track) return;
    
    const adjustedTime = currentTime + syncOffset;
    const scaledTime = adjustedTime * speedMultiplier;
    
    const cue = binarySearchCue(track.cues, scaledTime);
    
    set({ remoteSubtitleCue: cue });
  },
  
  /**
   * 원격 자막 동기화 수신
   */
  receiveSubtitleSync: (currentTime: number, cueId: string | null, trackId: string | null): void => {
    const { remoteTracks, syncOffset, speedMultiplier } = get();
    
    // 트랙 ID가 변경되면 업데이트
    if (trackId && trackId !== get().remoteActiveTrackId) {
      set({ remoteActiveTrackId: trackId });
    }
    
    const track = remoteTracks.get(get().remoteActiveTrackId || '');
    if (!track) {
      // 원격 트랙이 없으면 cue만 업데이트
      if (cueId) {
        set({ remoteSubtitleCue: { id: cueId, text: '', startTime: 0, endTime: 0 } });
      } else {
        set({ remoteSubtitleCue: null });
      }
      return;
    }
    
    // 시간 기반으로 cue 찾기
    const adjustedTime = currentTime + syncOffset;
    const scaledTime = adjustedTime * speedMultiplier;
    const cue = binarySearchCue(track.cues, scaledTime);
    
    set({ remoteSubtitleCue: cue });
  },
  
  /**
   * 원격 자막 큐 설정
   */
  setRemoteSubtitleCue: (cue: SubtitleCue | null): void => {
    set({ remoteSubtitleCue: cue });
  },

  /**
   * 동기화 오프셋 조정
   */
  adjustSyncOffset: (delta: number): void => {
    set(produce((state: SubtitleState) => {
      state.syncOffset += delta;
      state.syncOffset = Math.max(-10000, Math.min(10000, state.syncOffset));
    }));
    
    const offset = get().syncOffset;
    toast.info(
      `Subtitle delay: ${offset > 0 ? '+' : ''}${(offset / 1000).toFixed(2)}s`,
      { duration: 1000 }
    );
    
    get().broadcastSubtitleState();
  },

  /**
   * 재생 속도 배율 설정
   */
  setSpeedMultiplier: (speed: number): void => {
    const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
    set({ speedMultiplier: clampedSpeed });
    get().broadcastSubtitleState();
  },

  /**
   * 자막 스타일 업데이트
   */
  updateStyle: (style: Partial<SubtitleStyle>): void => {
    set(produce((state: SubtitleState) => {
      state.style = { ...state.style, ...style };
    }));
  },

  /**
   * 자막 위치 설정
   */
  setPosition: (position: 'top' | 'bottom' | 'custom'): void => {
    set({ position });
  },

  /**
   * 자막 내 검색
   */
  searchInSubtitles: (query: string): void => {
    if (!query.trim()) {
      set({ searchQuery: '', searchResults: [] });
      return;
    }
    
    const { tracks } = get();
    const results: Array<{ cue: SubtitleCue; trackId: string }> = [];
    
    tracks.forEach((track, trackId) => {
      track.cues.forEach(cue => {
        if (cue.text.toLowerCase().includes(query.toLowerCase())) {
          results.push({ cue, trackId });
        }
      });
    });
    
    set({ searchQuery: query, searchResults: results });
  },

  /**
   * 특정 큐로 점프
   */
  jumpToCue: (cue: SubtitleCue): void => {
    const event = new CustomEvent('subtitle-jump', {
      detail: { time: cue.startTime / 1000 }
    });
    window.dispatchEvent(event);
  },

  /**
   * 자막 내보내기
   */
  exportSubtitle: (trackId: string, format: 'srt' | 'vtt'): Blob => {
    const track = get().tracks.get(trackId);
    if (!track) {
      throw new Error('Track not found');
    }
    
    const nodes = track.cues.map(cue => ({
      id: cue.id,
      startTime: cue.startTime,
      endTime: cue.endTime,
      text: cue.text
    }));
    
    const content = SubtitleParser.stringify(nodes, format);
    return new Blob([content], { type: 'text/plain' });
  },

  /**
   * 자막 트랙 브로드캐스트
   */
  broadcastTrack: (trackId: string): void => {
    const track = get().tracks.get(trackId);
    if (!track) return;
    
    const { sendToAllPeers } = usePeerConnectionStore.getState();
    
    const packet = {
      type: 'subtitle-track',
      payload: {
        track: {
          id: track.id,
          label: track.label,
          language: track.language,
          format: track.format,
          cues: track.cues
        }
      }
    };
    
    sendToAllPeers(JSON.stringify(packet));
    
    console.log('[SubtitleStore] Broadcasting subtitle track to peers');
  },

  /**
   * 자막 트랙 수신
   */
  receiveTrack: (track: SubtitleTrack): void => {
    set(produce((state: SubtitleState) => {
      state.remoteTracks.set(track.id, track);
      
      if (!state.remoteActiveTrackId) {
        state.remoteActiveTrackId = track.id;
      }
    }));
    
    toast.info(`Received subtitle: ${track.label}`);
    console.log('[SubtitleStore] Received subtitle track from peer');
  },

  /**
   * P2P 자막 상태 브로드캐스트
   */
  broadcastSubtitleState: (): void => {
    const { activeTrackId, syncOffset, speedMultiplier, isEnabled } = get();
    
    const { sendToAllPeers } = usePeerConnectionStore.getState();
    
    const packet = {
      type: 'subtitle-state',
      payload: {
        activeTrackId,
        syncOffset,
        speedMultiplier,
        isEnabled,
        timestamp: Date.now()
      }
    };
    
    sendToAllPeers(JSON.stringify(packet));
  },

  /**
   * P2P 자막 상태 수신
   */
  receiveSubtitleState: (state: Partial<SubtitleState>): void => {
    set(produce((draft: SubtitleState) => {
      Object.assign(draft, state);
    }));
  },

  /**
   * Store 리셋
   */
  reset: (): void => {
    set({
      tracks: new Map(),
      activeTrackId: null,
      currentCue: null,
      nextCue: null,
      remoteTracks: new Map(),
      remoteActiveTrackId: null,
      remoteSubtitleCue: null,
      isRemoteSubtitleEnabled: false,
      syncOffset: 0,
      speedMultiplier: 1.0,
      isEnabled: true,
      position: 'bottom',
      customPosition: { x: 50, y: 90 },
      searchQuery: '',
      searchResults: []
    });
  }
}));

/**
 * 이진 탐색으로 현재 큐 찾기
 */
function binarySearchCue(cues: SubtitleCue[], time: number): SubtitleCue | null {
  let left = 0;
  let right = cues.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const cue = cues[mid];
    
    if (time >= cue.startTime && time <= cue.endTime) {
      return cue;
    }
    
    if (time < cue.startTime) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  return null;
}

/**
 * 다음 큐 찾기
 */
function findNextCue(cues: SubtitleCue[], time: number): SubtitleCue | null {
  for (const cue of cues) {
    if (cue.startTime > time) {
      return cue;
    }
  }
  return null;
}

/**
 * 자막 파일 유효성 검사
 */
function validateSubtitleFile(file: File): boolean {
  const validExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!validExtensions.includes(ext)) {
    toast.error('Unsupported subtitle format');
    return false;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    toast.error('Subtitle file too large (max 10MB)');
    return false;
  }
  
  return true;
}

// Store import 순서 조정
import { usePeerConnectionStore } from './usePeerConnectionStore';