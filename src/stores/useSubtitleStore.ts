/**
 * @fileoverview 자막 상태 관리 Store
 * @module stores/useSubtitleStore
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
// subtitle 라이브러리 import 제거
// import { parseSync, stringifySync } from 'subtitle';

// 커스텀 파서 import
import { SubtitleParser } from '@/lib/subtitle/parser';

/**
 * 자막 큐 인터페이스
 */
export interface SubtitleCue {
  /** 큐 고유 ID */
  id: string;
  /** 시작 시간 (밀리초) */
  startTime: number;
  /** 종료 시간 (밀리초) */
  endTime: number;
  /** 자막 텍스트 */
  text: string;
  /** 스타일 정보 (선택적) */
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
  /** 트랙 고유 ID */
  id: string;
  /** 트랙 레이블 (표시명) */
  label: string;
  /** 언어 코드 (ISO 639-1) */
  language: string;
  /** 자막 큐 배열 */
  cues: SubtitleCue[];
  /** 자막 포맷 */
  format: 'srt' | 'vtt' | 'ass' | 'ssa';
  /** 기본 트랙 여부 */
  isDefault?: boolean;
}

/**
 * 자막 스타일 설정
 */
export interface SubtitleStyle {
  /** 폰트 패밀리 */
  fontFamily: string;
  /** 폰트 크기 */
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  /** 폰트 굵기 */
  fontWeight: 'normal' | 'bold';
  /** 텍스트 색상 */
  color: string;
  /** 배경 색상 */
  backgroundColor: string;
  /** 배경 투명도 (0-1) */
  backgroundOpacity: number;
  /** 텍스트 테두리 스타일 */
  edgeStyle: 'none' | 'dropshadow' | 'raised' | 'depressed' | 'uniform';
  /** 테두리 색상 */
  edgeColor: string;
}

/**
 * 자막 Store 상태 인터페이스
 */
interface SubtitleState {
  /** 자막 트랙 Map */
  tracks: Map<string, SubtitleTrack>;
  /** 활성 트랙 ID */
  activeTrackId: string | null;
  /** 현재 표시 중인 큐 */
  currentCue: SubtitleCue | null;
  /** 다음 큐 */
  nextCue: SubtitleCue | null;
  /** 동기화 오프셋 (밀리초) */
  syncOffset: number;
  /** 자막 속도 배율 */
  speedMultiplier: number;
  /** 자막 활성화 여부 */
  isEnabled: boolean;
  /** 자막 위치 */
  position: 'top' | 'bottom' | 'custom';
  /** 커스텀 위치 좌표 */
  customPosition: { x: number; y: number };
  /** 자막 스타일 */
  style: SubtitleStyle;
  /** 검색 쿼리 */
  searchQuery: string;
  /** 검색 결과 */
  searchResults: Array<{ cue: SubtitleCue; trackId: string }>;
}

/**
 * 자막 Store 액션 인터페이스
 */
interface SubtitleActions {
  /** 자막 트랙 추가 */
  addTrack: (file: File) => Promise<void>;
  /** 자막 트랙 제거 */
  removeTrack: (trackId: string) => void;
  /** 활성 트랙 설정 */
  setActiveTrack: (trackId: string | null) => void;
  /** 비디오와 동기화 */
  syncWithVideo: (currentTime: number) => void;
  /** 동기화 오프셋 조정 */
  adjustSyncOffset: (delta: number) => void;
  /** 속도 배율 설정 */
  setSpeedMultiplier: (speed: number) => void;
  /** 스타일 업데이트 */
  updateStyle: (style: Partial<SubtitleStyle>) => void;
  /** 위치 설정 */
  setPosition: (position: 'top' | 'bottom' | 'custom') => void;
  /** 자막 검색 */
  searchInSubtitles: (query: string) => void;
  /** 큐로 점프 */
  jumpToCue: (cue: SubtitleCue) => void;
  /** 자막 내보내기 */
  exportSubtitle: (trackId: string, format: 'srt' | 'vtt') => Blob;
  /** P2P 자막 상태 브로드캐스트 */
  broadcastSubtitleState: () => void;
  /** P2P 자막 상태 수신 */
  receiveSubtitleState: (state: Partial<SubtitleState>) => void;
  /** Store 초기화 */
  reset: () => void;
}

/**
 * 자막 관리 Store
 */
export const useSubtitleStore = create<SubtitleState & SubtitleActions>((set, get) => ({
  // 초기 상태
  tracks: new Map(),
  activeTrackId: null,
  currentCue: null,
  nextCue: null,
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
   * 자막 파일을 파싱하여 트랙 추가
   * @param file - 자막 파일
   */
  addTrack: async (file: File): Promise<void> => {
    try {
      // 파일 검증
      if (!validateSubtitleFile(file)) {
        return;
      }

      // Worker로 파싱 위임
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
            
            // 첫 번째 트랙이면 자동 활성화
            if (!state.activeTrackId) {
              state.activeTrackId = payload.track.id;
            }
          }));
          
          toast.success(`Subtitle loaded: ${payload.track.label}`);
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
   * @param trackId - 트랙 ID
   */
  removeTrack: (trackId: string): void => {
    set(produce((state: SubtitleState) => {
      state.tracks.delete(trackId);
      
      // 활성 트랙이 제거되면 초기화
      if (state.activeTrackId === trackId) {
        state.activeTrackId = null;
        state.currentCue = null;
        state.nextCue = null;
      }
    }));
  },

  /**
   * 활성 트랙 설정
   * @param trackId - 트랙 ID (null이면 비활성화)
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
   * 비디오 시간과 자막 동기화
   * @param currentTime - 현재 재생 시간 (밀리초)
   */
  syncWithVideo: (currentTime: number): void => {
    const { tracks, activeTrackId, syncOffset, speedMultiplier } = get();
    
    if (!activeTrackId) return;
    
    const track = tracks.get(activeTrackId);
    if (!track) return;
    
    // 동기화 오프셋과 속도 배율 적용
    const adjustedTime = currentTime + syncOffset;
    const scaledTime = adjustedTime * speedMultiplier;
    
    // 이진 탐색으로 현재 큐 찾기
    const currentCue = binarySearchCue(track.cues, scaledTime);
    const nextCue = findNextCue(track.cues, scaledTime);
    
    set({ currentCue, nextCue });
  },

  /**
   * 동기화 오프셋 조정
   * @param delta - 조정할 오프셋 (밀리초)
   */
  adjustSyncOffset: (delta: number): void => {
    set(produce((state: SubtitleState) => {
      state.syncOffset += delta;
      
      // 범위 제한 (-10초 ~ +10초)
      state.syncOffset = Math.max(-10000, Math.min(10000, state.syncOffset));
    }));
    
    // 사용자 피드백
    const offset = get().syncOffset;
    toast.info(
      `Subtitle delay: ${offset > 0 ? '+' : ''}${(offset / 1000).toFixed(2)}s`,
      { duration: 1000 }
    );
    
    // P2P 브로드캐스트
    get().broadcastSubtitleState();
  },

  /**
   * 자막 속도 배율 설정
   * @param speed - 속도 배율 (0.5 ~ 2.0)
   */
  setSpeedMultiplier: (speed: number): void => {
    const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
    set({ speedMultiplier: clampedSpeed });
    
    // P2P 브로드캐스트
    get().broadcastSubtitleState();
  },

  /**
   * 자막 스타일 업데이트
   * @param style - 업데이트할 스타일 속성
   */
  updateStyle: (style: Partial<SubtitleStyle>): void => {
    set(produce((state: SubtitleState) => {
      state.style = { ...state.style, ...style };
    }));
  },

  /**
   * 자막 위치 설정
   * @param position - 위치 설정
   */
  setPosition: (position: 'top' | 'bottom' | 'custom'): void => {
    set({ position });
  },

  /**
   * 자막 내 텍스트 검색
   * @param query - 검색어
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
   * @param cue - 점프할 큐
   */
  jumpToCue: (cue: SubtitleCue): void => {
    // 비디오 시간 조정은 상위 컴포넌트에서 처리
    const event = new CustomEvent('subtitle-jump', {
      detail: { time: cue.startTime / 1000 } // 초 단위로 변환
    });
    window.dispatchEvent(event);
  },

  /**
   * 자막 내보내기
   * @param trackId - 트랙 ID
   * @param format - 내보낼 포맷
   * @returns Blob 객체
   */
  exportSubtitle: (trackId: string, format: 'srt' | 'vtt'): Blob => {
    const track = get().tracks.get(trackId);
    if (!track) {
      throw new Error('Track not found');
    }
    
    // 커스텀 파서 사용
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
   * P2P로 자막 상태 브로드캐스트
   */
  broadcastSubtitleState: (): void => {
    const { activeTrackId, syncOffset, speedMultiplier, isEnabled } = get();
    
    // PeerConnectionStore를 통해 전송
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
   * P2P로 수신한 자막 상태 적용
   * @param state - 수신한 상태
   */
  receiveSubtitleState: (state: Partial<SubtitleState>): void => {
    set(produce((draft: SubtitleState) => {
      Object.assign(draft, state);
    }));
  },

  /**
   * Store 초기화
   */
  reset: (): void => {
    set({
      tracks: new Map(),
      activeTrackId: null,
      currentCue: null,
      nextCue: null,
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
 * 이진 탐색으로 현재 시간에 해당하는 큐 찾기
 * @param cues - 정렬된 큐 배열
 * @param time - 현재 시간 (밀리초)
 * @returns 현재 큐 또는 null
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
 * @param cues - 정렬된 큐 배열
 * @param time - 현재 시간 (밀리초)
 * @returns 다음 큐 또는 null
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
 * 자막 파일 검증
 * @param file - 검증할 파일
 * @returns 유효성 여부
 */
function validateSubtitleFile(file: File): boolean {
  const validExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!validExtensions.includes(ext)) {
    toast.error('Unsupported subtitle format');
    return false;
  }
  
  if (file.size > 10 * 1024 * 1024) { // 10MB 제한
    toast.error('Subtitle file too large (max 10MB)');
    return false;
  }
  
  return true;
}

// Store import를 위한 임시 해결책
import { usePeerConnectionStore } from './usePeerConnectionStore';
