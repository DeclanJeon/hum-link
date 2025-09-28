// src/stores/useFileStreamingStore.ts
import { create } from 'zustand';
import { produce } from 'immer';

type FileType = 'video' | 'pdf' | 'image' | 'other';
type StreamQuality = 'low' | 'medium' | 'high';

interface FileStreamingState {
  selectedFile: File | null;
  fileType: FileType;
  isStreaming: boolean;
  streamQuality: StreamQuality;
  
  // PDF specific
  pdfDoc: any | null;
  currentPage: number;
  totalPages: number;
  
  // Stream metrics
  streamStartTime: number | null;
  bytesStreamed: number;
  fps: number;
  
  // Stream state tracking
  originalStreamSnapshot: any | null;
  
  // UI state - 최소화 관련 추가
  isMinimized: boolean;
  lastPosition: { x: number; y: number } | null;
}

interface FileStreamingActions {
  setSelectedFile: (file: File | null) => void;
  setFileType: (type: FileType) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamQuality: (quality: StreamQuality) => void;
  setPdfDoc: (doc: any) => void;
  setCurrentPage: (page: number) => void;
  setTotalPages: (pages: number) => void;
  updateStreamMetrics: (bytes: number, fps: number) => void;
  setOriginalStreamSnapshot: (snapshot: any) => void;
  
  // 최소화 관련 액션 추가
  setMinimized: (minimized: boolean) => void;
  setLastPosition: (position: { x: number; y: number }) => void;
  toggleMinimized: () => void;
  
  reset: () => void;
}

export const useFileStreamingStore = create<FileStreamingState & FileStreamingActions>((set) => ({
  selectedFile: null,
  fileType: 'other',
  isStreaming: false,
  streamQuality: 'medium',
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  streamStartTime: null,
  bytesStreamed: 0,
  fps: 0,
  originalStreamSnapshot: null,
  isMinimized: false,
  lastPosition: null,

  setSelectedFile: (file) => set({ selectedFile: file }),
  
  setFileType: (type) => set({ fileType: type }),
  
  setIsStreaming: (streaming) => set(produce(state => {
    state.isStreaming = streaming;
    if (streaming) {
      state.streamStartTime = Date.now();
      state.bytesStreamed = 0;
    } else {
      state.streamStartTime = null;
      // 스트리밍 종료 시 최소화 상태도 해제
      state.isMinimized = false;
    }
  })),
  
  setStreamQuality: (quality) => set({ streamQuality: quality }),
  
  setPdfDoc: (doc) => set({ pdfDoc: doc }),
  
  setCurrentPage: (page) => set({ currentPage: page }),
  
  setTotalPages: (pages) => set({ totalPages: pages }),
  
  updateStreamMetrics: (bytes, fps) => set(produce(state => {
    state.bytesStreamed += bytes;
    state.fps = fps;
  })),
  
  setOriginalStreamSnapshot: (snapshot) => set({ originalStreamSnapshot: snapshot }),
  
  setMinimized: (minimized) => set({ isMinimized: minimized }),
  
  setLastPosition: (position) => set({ lastPosition: position }),
  
  toggleMinimized: () => set(state => ({ isMinimized: !state.isMinimized })),
  
  reset: () => set({
    selectedFile: null,
    fileType: 'other',
    isStreaming: false,
    streamQuality: 'medium',
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    streamStartTime: null,
    bytesStreamed: 0,
    fps: 0,
    originalStreamSnapshot: null,
    isMinimized: false,
    lastPosition: null,
  }),
}));
