import { toast } from 'sonner';

export interface VideoLoadResult {
  success: boolean;
  duration: number;
  error?: Error;
}

export class VideoLoader {
  private retryCount = 0;
  private readonly maxRetries = 3;
  private loadTimeout = 30000; // 30초로 증가
  
  async loadWithRetry(
    file: File, 
    videoElement: HTMLVideoElement
  ): Promise<VideoLoadResult> {
    console.log(`[VideoLoader] Starting to load video: ${file.name}`);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[VideoLoader] Attempt ${attempt}/${this.maxRetries}`);
        const result = await this.attemptLoad(file, videoElement);
        
        if (result.success) {
          console.log(`[VideoLoader] Successfully loaded on attempt ${attempt}`);
          this.retryCount = 0;
          return result;
        }
        
        if (attempt < this.maxRetries) {
          const delay = this.getRetryDelay(attempt);
          console.log(`[VideoLoader] Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      } catch (error) {
        console.error(`[VideoLoader] Attempt ${attempt} failed:`, error);
        
        if (attempt === this.maxRetries) {
          return {
            success: false,
            duration: 0,
            error: error as Error
          };
        }
      }
    }
    
    return {
      success: false,
      duration: 0,
      error: new Error('Max retries exceeded')
    };
  }
  
  private async attemptLoad(
    file: File,
    videoElement: HTMLVideoElement
  ): Promise<VideoLoadResult> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Video load timeout'));
      }, this.loadTimeout);
      
      let metadataLoaded = false;
      let canPlayThrough = false;
      
      const cleanup = () => {
        clearTimeout(timeout);
        videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
        videoElement.removeEventListener('canplaythrough', onCanPlayThrough);
        videoElement.removeEventListener('error', onError);
        videoElement.removeEventListener('loadeddata', onLoadedData);
      };
      
      const checkReady = () => {
        if (metadataLoaded) {
          cleanup();
          resolve({
            success: true,
            duration: videoElement.duration
          });
        }
      };
      
      const onLoadedMetadata = () => {
        console.log('[VideoLoader] Metadata loaded');
        metadataLoaded = true;
        checkReady();
      };
      
      const onLoadedData = () => {
        console.log('[VideoLoader] Data loaded');
        // loadeddata 이벤트만으로도 충분
        if (!metadataLoaded) {
          metadataLoaded = true;
          checkReady();
        }
      };
      
      const onCanPlayThrough = () => {
        console.log('[VideoLoader] Can play through');
        canPlayThrough = true;
        if (!metadataLoaded) {
          metadataLoaded = true;
          checkReady();
        }
      };
      
      const onError = () => {
        const error = videoElement.error;
        cleanup();
        URL.revokeObjectURL(url);
        
        let errorMessage = 'Unknown video error';
        if (error) {
          switch (error.code) {
            case 1: errorMessage = 'MEDIA_ERR_ABORTED'; break;
            case 2: errorMessage = 'MEDIA_ERR_NETWORK'; break;
            case 3: errorMessage = 'MEDIA_ERR_DECODE'; break;
            case 4: errorMessage = 'MEDIA_ERR_SRC_NOT_SUPPORTED'; break;
          }
        }
        
        reject(new Error(errorMessage));
      };
      
      videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
      videoElement.addEventListener('loadeddata', onLoadedData);
      videoElement.addEventListener('canplaythrough', onCanPlayThrough);
      videoElement.addEventListener('error', onError);
      
      videoElement.preload = 'auto';
      videoElement.src = url;
      videoElement.load();
    });
  }
  
  private getRetryDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt - 1), 5000);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  static canPlayType(mimeType: string): boolean {
    const video = document.createElement('video');
    const canPlay = video.canPlayType(mimeType);
    return canPlay === 'probably' || canPlay === 'maybe';
  }
  
  static validateFile(file: File): { valid: boolean; error?: string } {
    // 파일 크기 제한 제거
    
    // MIME 타입 확인
    if (!file.type.startsWith('video/')) {
      return { valid: false, error: 'Not a video file' };
    }
    
    // 지원 형식 확인 (경고만)
    const supportedFormats = ['video/mp4', 'video/webm', 'video/ogg'];
    if (!supportedFormats.includes(file.type)) {
      // 에러 대신 경고
      console.warn(`[VideoLoader] Video format ${file.type} may not be fully supported`);
    }
    
    return { valid: true };
  }
}