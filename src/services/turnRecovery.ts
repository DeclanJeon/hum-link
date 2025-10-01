/**
 * TURN 연결 복구 관리자
 */
import { toast } from 'sonner';

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'degraded';
  action: () => Promise<RTCIceServer[]>;
}

export class TurnRecoveryManager {
  private retryCount = 0;
  private readonly maxRetries = 3;
  private lastError: Error | null = null;
  private fallbackServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // 폴백 TURN 서버 추가
    {
      urls: 'turn:turn.peerterra.com:3478',
      username: 'kron_turn',
      credential: 'kron1234'
    }
  ];
  
  /**
   * TURN 연결 실패 처리
   */
  async handleTurnFailure(
    error: Error,
    currentServers?: RTCIceServer[]
  ): Promise<RTCIceServer[]> {
    console.error('[TurnRecovery] Connection failed:', error);
    this.lastError = error;
    
    const strategy = this.determineStrategy(error);
    
    switch (strategy.type) {
      case 'retry':
        return this.retryConnection(currentServers);
        
      case 'fallback':
        return this.useFallbackServers();
        
      case 'degraded':
        return this.degradedMode();
        
      default:
        return this.fallbackServers;
    }
  }
  
  /**
   * 복구 전략 결정
   */
  private determineStrategy(error: Error): RecoveryStrategy {
    // 네트워크 오류
    if (error.message.includes('network') || error.message.includes('ERR_NETWORK')) {
      if (this.retryCount < this.maxRetries) {
        return {
          type: 'retry',
          action: async () => this.requestNewCredentials()
        };
      }
    }
    
    // 인증 오류
    if (error.message.includes('401') || error.message.includes('403')) {
      return {
        type: 'fallback',
        action: async () => this.fallbackServers
      };
    }
    
    // 서버 오류
    if (error.message.includes('500') || error.message.includes('503')) {
      return {
        type: 'degraded',
        action: async () => this.requestAlternativeServers()
      };
    }
    
    // 기본: fallback
    return {
      type: 'fallback',
      action: async () => this.fallbackServers
    };
  }
  
  /**
   * 연결 재시도
   */
  private async retryConnection(
    currentServers?: RTCIceServer[]
  ): Promise<RTCIceServer[]> {
    this.retryCount++;
    
    console.log(`[TurnRecovery] Retry attempt ${this.retryCount}/${this.maxRetries}`);
    
    // 지수 백오프
    const delay = Math.min(30000, Math.pow(2, this.retryCount) * 1000);
    await this.delay(delay);
    
    try {
      const servers = await this.requestNewCredentials();
      
      if (servers && servers.length > 0) {
        this.retryCount = 0; // 성공시 리셋
        toast.success('Relay connection restored');
        return servers;
      }
    } catch (error) {
      console.error('[TurnRecovery] Retry failed:', error);
    }
    
    // 재시도 실패시 fallback
    if (this.retryCount >= this.maxRetries) {
      return this.useFallbackServers();
    }
    
    return currentServers || this.fallbackServers;
  }
  
  /**
   * Fallback 서버 사용
   */
  private useFallbackServers(): RTCIceServer[] {
    console.warn('[TurnRecovery] Using fallback STUN servers');
    
    toast.warning('Using fallback connection - quality may be reduced', {
      duration: 5000
    });
    
    return this.fallbackServers;
  }
  
  /**
   * 성능 저하 모드
   */
  private degradedMode(): RTCIceServer[] {
    console.warn('[TurnRecovery] Entering degraded mode');
    
    toast.warning('Running in limited mode - some features may be unavailable', {
      duration: 5000
    });
    
    // STUN 전용 + 제한된 기능
    return this.fallbackServers.slice(0, 2); // 처음 2개만 사용
  }
  
  /**
   * 새 자격증명 요청
   */
  private async requestNewCredentials(): Promise<RTCIceServer[]> {
    try {
      const response = await fetch('/api/turn/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: localStorage.getItem('userId'),
          roomId: localStorage.getItem('roomId')
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data.iceServers || [];
      
    } catch (error) {
      console.error('[TurnRecovery] Failed to get new credentials:', error);
      throw error;
    }
  }
  
  /**
   * 대체 서버 요청
   */
  private async requestAlternativeServers(): Promise<RTCIceServer[]> {
    try {
      const response = await fetch('/api/turn/alternative', {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data.iceServers || this.fallbackServers;
      
    } catch (error) {
      console.error('[TurnRecovery] Failed to get alternative servers:', error);
      return this.fallbackServers;
    }
  }
  
  /**
   * 지연 유틸리티
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 상태 리셋
   */
  reset(): void {
    this.retryCount = 0;
    this.lastError = null;
  }
  
  /**
   * 현재 상태 조회
   */
  getStatus(): {
    retryCount: number;
    maxRetries: number;
    lastError: Error | null;
    isRecovering: boolean;
  } {
    return {
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      lastError: this.lastError,
      isRecovering: this.retryCount > 0
    };
  }
}
