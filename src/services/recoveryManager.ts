// src/services/recoveryManager.ts
import { toast } from 'sonner';

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'reset';
  action: () => Promise<void>;
}

export class RecoveryManager {
  private recoveryAttempts: Map<string, number> = new Map();
  private readonly maxRecoveryAttempts = 3;
  
  /**
   * 스트림 실패 처리
   */
  async handleStreamFailure(
    error: Error,
    context: {
      onRetry?: () => Promise<void>;
      onFallback?: () => Promise<void>;
      onReset?: () => Promise<void>;
    }
  ): Promise<boolean> {
    console.error('[RecoveryManager] Handling stream failure:', error);
    
    const errorKey = this.getErrorKey(error);
    const attempts = this.recoveryAttempts.get(errorKey) || 0;
    
    if (attempts >= this.maxRecoveryAttempts) {
      console.error('[RecoveryManager] Max recovery attempts reached');
      toast.error('Failed to recover stream. Please refresh the page.');
      return false;
    }
    
    this.recoveryAttempts.set(errorKey, attempts + 1);
    
    const strategy = this.determineStrategy(error, attempts);
    
    switch (strategy.type) {
      case 'retry':
        if (context.onRetry) {
          toast.info('Retrying stream connection...');
          await this.delay(1000 * (attempts + 1));
          await context.onRetry();
          return true;
        }
        break;
        
      case 'fallback':
        if (context.onFallback) {
          toast.warning('Switching to fallback mode...');
          await context.onFallback();
          return true;
        }
        break;
        
      case 'reset':
        if (context.onReset) {
          toast.info('Resetting stream...');
          await context.onReset();
          return true;
        }
        break;
    }
    
    return false;
  }
  
  /**
   * 에러 복구 전략 결정
   */
  private determineStrategy(error: Error, attempts: number): RecoveryStrategy {
    // 권한 에러
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return {
        type: 'fallback',
        action: async () => {
          console.log('[RecoveryManager] Permission denied, requesting again...');
        }
      };
    }
    
    // 디바이스 에러
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      if (attempts < 2) {
        return {
          type: 'retry',
          action: async () => {
            console.log('[RecoveryManager] Device error, retrying...');
          }
        };
      } else {
        return {
          type: 'reset',
          action: async () => {
            console.log('[RecoveryManager] Device error persists, resetting...');
          }
        };
      }
    }
    
    // 네트워크 에러
    if (error.name === 'NetworkError' || error.message.includes('network')) {
      return {
        type: 'retry',
        action: async () => {
          console.log('[RecoveryManager] Network error, retrying...');
        }
      };
    }
    
    // 기본 전략
    return {
      type: attempts < 2 ? 'retry' : 'reset',
      action: async () => {
        console.log('[RecoveryManager] Generic error, applying default strategy...');
      }
    };
  }
  
  /**
   * 파일 로드 실패 처리
   */
  async handleFileLoadFailure(
    error: Error,
    file: File
  ): Promise<{ recovered: boolean; suggestion?: string }> {
    console.error('[RecoveryManager] File load failure:', error);
    
    // 코덱 문제
    if (error.message.includes('DECODE') || error.message.includes('NOT_SUPPORTED')) {
      return {
        recovered: false,
        suggestion: 'This file format may not be supported. Try converting to MP4 (H.264).'
      };
    }
    
    // 파일 크기 문제
    if (file.size > 1024 * 1024 * 1024) { // 1GB
      return {
        recovered: false,
        suggestion: 'Large file detected. Consider using a smaller file or compressing it.'
      };
    }
    
    // 메모리 문제
    if (error.message.includes('memory') || error.name === 'QuotaExceededError') {
      return {
        recovered: false,
        suggestion: 'Insufficient memory. Close other tabs and try again.'
      };
    }
    
    return {
      recovered: false,
      suggestion: 'Failed to load file. Please try a different file.'
    };
  }
  
  /**
   * WebRTC 연결 실패 처리
   */
  async handleConnectionFailure(
    peerId: string,
    error: Error
  ): Promise<void> {
    console.error(`[RecoveryManager] Connection failure for peer ${peerId}:`, error);
    
    const attempts = this.recoveryAttempts.get(`conn_${peerId}`) || 0;
    
    if (attempts < this.maxRecoveryAttempts) {
      this.recoveryAttempts.set(`conn_${peerId}`, attempts + 1);
      toast.warning(`Connection issue with peer. Attempt ${attempts + 1}/${this.maxRecoveryAttempts}`);
    } else {
      toast.error('Failed to establish connection with peer.');
    }
  }
  
  /**
   * 에러 키 생성
   */
  private getErrorKey(error: Error): string {
    return `${error.name}_${error.message}`.substring(0, 50);
  }
  
  /**
   * 지연 유틸리티
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 복구 시도 횟수 초기화
   */
  reset(): void {
    this.recoveryAttempts.clear();
  }
  
  /**
   * 특정 에러의 복구 시도 횟수 초기화
   */
  resetError(errorKey: string): void {
    this.recoveryAttempts.delete(errorKey);
  }
}
