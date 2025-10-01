/**
 * @fileoverview MediaRecorder 기반 실시간 스트리밍 서비스
 * @module services/mediaRecorderStreaming
 */

import { getOptimalMimeType } from '@/lib/deviceDetector';
import { StreamingConfig } from '@/lib/streamingStrategy';

/**
 * MediaRecorder 스트리밍 이벤트
 */
export interface MediaRecorderStreamingEvents {
  onChunkReady: (blob: Blob, timestamp: number) => void;
  onError: (error: Error) => void;
  onStateChange: (state: 'inactive' | 'recording' | 'paused') => void;
  onBitrateUpdate?: (bitrate: number) => void;
}

/**
 * 스트리밍 통계
 */
export interface StreamingStats {
  duration: number;
  chunksGenerated: number;
  totalBytes: number;
  averageBitrate: number;
  currentBitrate: number;
  droppedFrames: number;
}

/**
 * MediaRecorder 기반 스트리밍 클래스
 */
export class MediaRecorderStreaming {
  private mediaRecorder: MediaRecorder | null = null;
  private sourceStream: MediaStream | null = null;
  private isActive: boolean = false;
  private startTime: number = 0;
  private stats: StreamingStats = {
    duration: 0,
    chunksGenerated: 0,
    totalBytes: 0,
    averageBitrate: 0,
    currentBitrate: 0,
    droppedFrames: 0
  };
  
  private lastChunkTime: number = 0;
  private lastChunkSize: number = 0;
  
  constructor(private events: MediaRecorderStreamingEvents) {}
  
  /**
   * 스트리밍 시작
   */
  async start(
    videoElement: HTMLVideoElement,
    config: StreamingConfig
  ): Promise<void> {
    if (this.isActive) {
      throw new Error('Streaming already active');
    }
    
    try {
      // 비디오 엘리먼트에서 스트림 생성
      this.sourceStream = await this.createStreamFromVideo(videoElement, config);
      
      if (!this.sourceStream) {
        throw new Error('Failed to create source stream');
      }
      
      // MediaRecorder 생성
      const mimeType = config.mimeType || getOptimalMimeType();
      const options: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: config.videoBitsPerSecond,
        audioBitsPerSecond: config.audioBitsPerSecond
      };
      
      console.log('[MediaRecorderStreaming] Creating MediaRecorder with options:', options);
      
      this.mediaRecorder = new MediaRecorder(this.sourceStream, options);
      
      // 이벤트 핸들러 설정
      this.setupEventHandlers(config.timeslice);
      
      // 녹화 시작
      this.mediaRecorder.start(config.timeslice);
      this.isActive = true;
      this.startTime = Date.now();
      
      console.log('[MediaRecorderStreaming] Started with timeslice:', config.timeslice);
      
    } catch (error) {
      console.error('[MediaRecorderStreaming] Failed to start:', error);
      this.cleanup();
      throw error;
    }
  }
  
  /**
   * 비디오 엘리먼트에서 스트림 생성
   */
  private async createStreamFromVideo(
    videoElement: HTMLVideoElement,
    config: StreamingConfig
  ): Promise<MediaStream | null> {
    // 1차 시도: captureStream (iOS 15+)
    if ('captureStream' in videoElement) {
      try {
        const stream = (videoElement as any).captureStream(config.fps);
        if (stream && stream.getTracks().length > 0) {
          console.log('[MediaRecorderStreaming] Using captureStream');
          return stream;
        }
      } catch (e) {
        console.warn('[MediaRecorderStreaming] captureStream failed:', e);
      }
    }
    
    // 2차 시도: mozCaptureStream (Firefox)
    if ('mozCaptureStream' in videoElement) {
      try {
        const stream = (videoElement as any).mozCaptureStream(config.fps);
        if (stream && stream.getTracks().length > 0) {
          console.log('[MediaRecorderStreaming] Using mozCaptureStream');
          return stream;
        }
      } catch (e) {
        console.warn('[MediaRecorderStreaming] mozCaptureStream failed:', e);
      }
    }
    
    // 3차 시도: Canvas 폴백
    console.log('[MediaRecorderStreaming] Using Canvas fallback');
    return this.createCanvasStream(videoElement, config.fps);
  }
  
  /**
   * Canvas 기반 스트림 생성
   */
  private createCanvasStream(
    videoElement: HTMLVideoElement,
    fps: number
  ): MediaStream {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // 비디오 크기에 맞춰 캔버스 크기 설정
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;
    
    console.log(`[MediaRecorderStreaming] Canvas size: ${canvas.width}x${canvas.height}`);
    
    // 스트림 생성
    const stream = (canvas as any).captureStream(fps);
    
    // 프레임 그리기 루프
    let animationId: number;
    const drawFrame = () => {
      if (!this.isActive) {
        cancelAnimationFrame(animationId);
        return;
      }
      
      if (!videoElement.paused && !videoElement.ended) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      }
      
      animationId = requestAnimationFrame(drawFrame);
    };
    
    drawFrame();
    
    return stream;
  }
  
  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(timeslice: number): void {
    if (!this.mediaRecorder) return;
    
    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        const now = Date.now();
        const chunkSize = event.data.size;
        
        // 통계 업데이트
        this.stats.chunksGenerated++;
        this.stats.totalBytes += chunkSize;
        this.stats.duration = now - this.startTime;
        this.stats.averageBitrate = (this.stats.totalBytes * 8) / (this.stats.duration / 1000);
        
        // 현재 비트레이트 계산
        if (this.lastChunkTime > 0) {
          const timeDelta = (now - this.lastChunkTime) / 1000;
          this.stats.currentBitrate = (chunkSize * 8) / timeDelta;
          
          // 비트레이트 콜백
          if (this.events.onBitrateUpdate) {
            this.events.onBitrateUpdate(this.stats.currentBitrate);
          }
        }
        
        this.lastChunkTime = now;
        this.lastChunkSize = chunkSize;
        
        // 청크 전달
        this.events.onChunkReady(event.data, now);
      }
    };
    
    this.mediaRecorder.onerror = (event: Event) => {
      const error = (event as any).error || new Error('MediaRecorder error');
      console.error('[MediaRecorderStreaming] Error:', error);
      this.events.onError(error);
    };
    
    this.mediaRecorder.onstart = () => {
      console.log('[MediaRecorderStreaming] Recording started');
      this.events.onStateChange('recording');
    };
    
    this.mediaRecorder.onstop = () => {
      console.log('[MediaRecorderStreaming] Recording stopped');
      this.events.onStateChange('inactive');
    };
    
    this.mediaRecorder.onpause = () => {
      console.log('[MediaRecorderStreaming] Recording paused');
      this.events.onStateChange('paused');
    };
    
    this.mediaRecorder.onresume = () => {
      console.log('[MediaRecorderStreaming] Recording resumed');
      this.events.onStateChange('recording');
    };
  }
  
  /**
   * 일시정지
   */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }
  
  /**
   * 재개
   */
  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }
  
  /**
   * 중지
   */
  stop(): void {
    if (this.mediaRecorder && this.isActive) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (e) {
        console.warn('[MediaRecorderStreaming] Error stopping:', e);
      }
    }
    
    this.cleanup();
  }
  
  /**
   * 리소스 정리
   */
  private cleanup(): void {
    this.isActive = false;
    
    if (this.sourceStream) {
      this.sourceStream.getTracks().forEach(track => {
        track.stop();
      });
      this.sourceStream = null;
    }
    
    this.mediaRecorder = null;
  }
  
  /**
   * 통계 조회
   */
  getStats(): StreamingStats {
    return { ...this.stats };
  }
  
  /**
   * 활성 상태 확인
   */
  isStreaming(): boolean {
    return this.isActive && this.mediaRecorder?.state === 'recording';
  }
}
