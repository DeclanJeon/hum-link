/**
 * @fileoverview 적응형 스트리밍 매니저 - 전략에 따라 적절한 스트리밍 방식 선택
 * @module services/adaptiveStreamManager
 */

import { 
    selectStreamingStrategy, 
    StreamingStrategy, 
    StrategySelection,
    StreamingConfig 
  } from '@/lib/streamingStrategy';
  import { MediaRecorderStreaming, MediaRecorderStreamingEvents } from './mediaRecorderStreaming';
  import { getDeviceInfo } from '@/lib/deviceDetector';
  import { toast } from 'sonner';
  
  /**
   * 스트림 생성 결과
   */
  export interface StreamCreationResult {
    stream: MediaStream;
    strategy: StreamingStrategy;
    config: StreamingConfig;
    cleanup: () => void;
  }
  
  /**
   * 적응형 스트리밍 매니저
   */
  export class AdaptiveStreamManager {
    private currentStrategy: StrategySelection;
    private mediaRecorderStreaming: MediaRecorderStreaming | null = null;
    private canvasAnimationId: number | null = null;
    private currentStream: MediaStream | null = null;
    
    constructor() {
      this.currentStrategy = selectStreamingStrategy();
      console.log('[AdaptiveStreamManager] Selected strategy:', this.currentStrategy);
    }
    
    /**
     * 디바이스 정보 및 선택된 전략 조회
     */
    getInfo(): { device: ReturnType<typeof getDeviceInfo>; strategy: StrategySelection } {
      return {
        device: getDeviceInfo(),
        strategy: this.currentStrategy
      };
    }
    
    /**
     * 스트림 생성
     */
    async createStream(
      videoElement: HTMLVideoElement,
      onChunkReady?: (blob: Blob, timestamp: number) => void
    ): Promise<StreamCreationResult> {
      const { strategy, config, fallbacks } = this.currentStrategy;
      
      console.log(`[AdaptiveStreamManager] Creating stream with strategy: ${strategy}`);
      
      // 전략에 따라 스트림 생성 시도
      try {
        switch (strategy) {
          case 'mediarecorder':
            return await this.createMediaRecorderStream(videoElement, config, onChunkReady);
          
          case 'capturestream':
            return await this.createCaptureStream(videoElement, config);
          
          case 'canvas':
            return await this.createCanvasStream(videoElement, config);
          
          default:
            throw new Error(`Unknown strategy: ${strategy}`);
        }
      } catch (error) {
        console.error(`[AdaptiveStreamManager] Strategy ${strategy} failed:`, error);
        
        // 폴백 전략 시도
        for (const fallbackStrategy of fallbacks) {
          console.log(`[AdaptiveStreamManager] Trying fallback: ${fallbackStrategy}`);
          
          try {
            switch (fallbackStrategy) {
              case 'capturestream':
                return await this.createCaptureStream(videoElement, config);
              
              case 'canvas':
                return await this.createCanvasStream(videoElement, config);
            }
          } catch (fallbackError) {
            console.error(`[AdaptiveStreamManager] Fallback ${fallbackStrategy} failed:`, fallbackError);
            continue;
          }
        }
        
        // 모든 전략 실패
        throw new Error('All streaming strategies failed');
      }
    }
    
    /**
     * MediaRecorder 기반 스트림 생성
     */
    private async createMediaRecorderStream(
      videoElement: HTMLVideoElement,
      config: StreamingConfig,
      onChunkReady?: (blob: Blob, timestamp: number) => void
    ): Promise<StreamCreationResult> {
      console.log('[AdaptiveStreamManager] Using MediaRecorder strategy');
      
      // MediaRecorder 이벤트 핸들러
      const events: MediaRecorderStreamingEvents = {
        onChunkReady: (blob, timestamp) => {
          if (onChunkReady) {
            onChunkReady(blob, timestamp);
          }
        },
        onError: (error) => {
          console.error('[AdaptiveStreamManager] MediaRecorder error:', error);
          toast.error(`Streaming error: ${error.message}`);
        },
        onStateChange: (state) => {
          console.log('[AdaptiveStreamManager] MediaRecorder state:', state);
        },
        onBitrateUpdate: (bitrate) => {
          // 비트레이트 모니터링 (필요시)
          if (bitrate < 500000) { // 500 Kbps 이하
            console.warn('[AdaptiveStreamManager] Low bitrate detected:', bitrate);
          }
        }
      };
      
      this.mediaRecorderStreaming = new MediaRecorderStreaming(events);
      
      try {
        await this.mediaRecorderStreaming.start(videoElement, config);
        
        // MediaRecorder는 내부적으로 스트림을 생성하므로 더미 스트림 반환
        const dummyStream = new MediaStream();
        this.currentStream = dummyStream;
        
        toast.success('MediaRecorder streaming started (iOS optimized)', { duration: 2000 });
        
        return {
          stream: dummyStream,
          strategy: 'mediarecorder',
          config,
          cleanup: () => {
            this.mediaRecorderStreaming?.stop();
            this.mediaRecorderStreaming = null;
            this.currentStream = null;
          }
        };
      } catch (error) {
        this.mediaRecorderStreaming = null;
        throw error;
      }
    }
    
    /**
     * captureStream 기반 스트림 생성
     */
    private async createCaptureStream(
      videoElement: HTMLVideoElement,
      config: StreamingConfig
    ): Promise<StreamCreationResult> {
      console.log('[AdaptiveStreamManager] Using captureStream strategy');
      
      let stream: MediaStream | null = null;
      
      // captureStream 시도
      if ('captureStream' in videoElement) {
        try {
          stream = (videoElement as any).captureStream(config.fps);
        } catch (e) {
          console.warn('[AdaptiveStreamManager] captureStream failed:', e);
        }
      }
      
      // mozCaptureStream 시도 (Firefox)
      if (!stream && 'mozCaptureStream' in videoElement) {
        try {
          stream = (videoElement as any).mozCaptureStream(config.fps);
        } catch (e) {
          console.warn('[AdaptiveStreamManager] mozCaptureStream failed:', e);
        }
      }
      
      if (!stream || stream.getTracks().length === 0) {
        throw new Error('Failed to create captureStream');
      }
      
      this.currentStream = stream;
      
      toast.success(`Video streaming started (${config.fps}fps)`, { duration: 2000 });
      
      return {
        stream,
        strategy: 'capturestream',
        config,
        cleanup: () => {
          if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
          }
        }
      };
    }
    
    /**
     * Canvas 기반 스트림 생성
     */
    private async createCanvasStream(
      videoElement: HTMLVideoElement,
      config: StreamingConfig
    ): Promise<StreamCreationResult> {
      console.log('[AdaptiveStreamManager] Using Canvas fallback strategy');
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // 비디오 크기 설정
      canvas.width = videoElement.videoWidth || 1280;
      canvas.height = videoElement.videoHeight || 720;
      
      console.log(`[AdaptiveStreamManager] Canvas size: ${canvas.width}x${canvas.height}`);
      
      // 스트림 생성
      let stream: MediaStream;
      
      if ('captureStream' in canvas) {
        stream = (canvas as any).captureStream(config.fps);
      } else if ('mozCaptureStream' in canvas) {
        stream = (canvas as any).mozCaptureStream(config.fps);
      } else {
        throw new Error('Canvas captureStream not supported');
      }
      
      // 프레임 그리기
      const drawFrame = () => {
        if (!videoElement.paused && !videoElement.ended) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }
        
        this.canvasAnimationId = requestAnimationFrame(drawFrame);
      };
      
      drawFrame();
      
      this.currentStream = stream;
      
      toast.info(`Canvas streaming started (${config.fps}fps, compatibility mode)`, { duration: 2000 });
      
      return {
        stream,
        strategy: 'canvas',
        config,
        cleanup: () => {
          if (this.canvasAnimationId) {
            cancelAnimationFrame(this.canvasAnimationId);
            this.canvasAnimationId = null;
          }
          
          if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
          }
        }
      };
    }
    
    /**
     * 현재 스트리밍 중인지 확인
     */
    isStreaming(): boolean {
      if (this.mediaRecorderStreaming) {
        return this.mediaRecorderStreaming.isStreaming();
      }
      
      return this.currentStream !== null;
    }
    
    /**
     * 전체 정리
     */
    cleanup(): void {
      if (this.mediaRecorderStreaming) {
        this.mediaRecorderStreaming.stop();
        this.mediaRecorderStreaming = null;
      }
      
      if (this.canvasAnimationId) {
        cancelAnimationFrame(this.canvasAnimationId);
        this.canvasAnimationId = null;
      }
      
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
        this.currentStream = null;
      }
    }
  }
  