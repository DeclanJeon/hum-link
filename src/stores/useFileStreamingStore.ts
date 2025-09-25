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

  setSelectedFile: (file) => set({ selectedFile: file }),
  
  setFileType: (type) => set({ fileType: type }),
  
  setIsStreaming: (streaming) => set(produce(state => {
    state.isStreaming = streaming;
    if (streaming) {
      state.streamStartTime = Date.now();
      state.bytesStreamed = 0;
    } else {
      state.streamStartTime = null;
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
  }),
}));