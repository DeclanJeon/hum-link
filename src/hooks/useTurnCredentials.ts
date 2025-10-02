/**
 * TURN 자격증명 관리 Hook (개선 버전)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useSignalingStore } from '@/stores/useSignalingStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { toast } from 'sonner';

interface TurnCredentialsResponse {
  iceServers?: RTCIceServer[];
  ttl?: number;
  timestamp?: number;
  error?: string;
  code?: string;
  quota?: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
  };
  stats?: {
    connectionCount: number;
    connectionLimit: number;
  };
}

/**
 * 소켓 연결 상태
 */
type SocketState = 'disconnected' | 'connecting' | 'connected';

export const useTurnCredentials = () => {
  const renewalTimer = useRef<NodeJS.Timeout>();
  const retryCount = useRef(0);
  const lastCredentials = useRef<TurnCredentialsResponse | null>(null);
  const isRequestingRef = useRef(false);
  const socketWaitTimer = useRef<NodeJS.Timeout>();
  
  const { socket, status: signalingStatus } = useSignalingStore();
  const { updateIceServers } = usePeerConnectionStore();
  
  /**
   * 소켓 연결 대기 (Promise 기반)
   */
  const waitForSocketConnection = useCallback(async (): Promise<boolean> => {
    const maxWaitTime = 10000; // 10초
    const checkInterval = 200; // 200ms마다 체크
    let elapsed = 0;
    
    console.log('[TurnCredentials] Waiting for socket connection...');
    
    return new Promise((resolve) => {
      const checkConnection = () => {
        const currentSocket = useSignalingStore.getState().socket;
        const currentStatus = useSignalingStore.getState().status;
        
        // ✅ 추가: socket.data.userId 확인
        const hasUserId = currentSocket && (currentSocket as any).data?.userId;
        
        // 연결 성공
        if (currentSocket && currentSocket.connected && currentStatus === 'connected' && hasUserId) {
          console.log('[TurnCredentials] ✅ Socket connected');
          resolve(true);
          return;
        }
        
        // 타임아웃
        if (elapsed >= maxWaitTime) {
          console.warn('[TurnCredentials] ⏱️ Socket connection timeout');
          resolve(false);
          return;
        }
        
        // 계속 대기
        elapsed += checkInterval;
        socketWaitTimer.current = setTimeout(checkConnection, checkInterval);
      };
      
      checkConnection();
    });
  }, []);
  
  /**
   * TURN 자격증명 요청
   */
  const requestCredentials = useCallback(async () => {
    // 중복 요청 방지
    if (isRequestingRef.current) {
      console.log('[TurnCredentials] ⚠️ Request already in progress, skipping');
      return;
    }
    
    const currentSocket = useSignalingStore.getState().socket;
    
    // 소켓이 없거나 연결되지 않은 경우
    if (!currentSocket || !currentSocket.connected) {
      console.log('[TurnCredentials] 🔌 Socket not ready, waiting...');
      
      const isConnected = await waitForSocketConnection();
      
      if (!isConnected) {
        console.error('[TurnCredentials] ❌ Failed to establish socket connection');
        toast.error('서버 연결 실패. STUN 서버만 사용합니다.');
        
        // Fallback: STUN only
        updateIceServers([
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]);
        
        return;
      }
    }
    
    // 재요청
    const socket = useSignalingStore.getState().socket;
    if (!socket) {
      console.error('[TurnCredentials] Socket lost during wait');
      return;
    }
    
    isRequestingRef.current = true;
    console.log('[TurnCredentials] 📡 Requesting TURN credentials...');
    
    socket.emit('request-turn-credentials');
    
    // 응답 핸들러 설정
    const handleCredentials = (data: TurnCredentialsResponse) => {
      console.log('[TurnCredentials] 📥 Received response:', {
        hasIceServers: !!data.iceServers,
        ttl: data.ttl,
        error: data.error
      });
      
      if (data.error) {
        handleError(data);
        isRequestingRef.current = false;
        return;
      }
      
      if (data.iceServers) {
        // ICE 서버 업데이트
        updateIceServers(data.iceServers);
        lastCredentials.current = data;
        retryCount.current = 0;
        
        // 쿼터 경고
        if (data.quota && data.quota.percentage > 80) {
          toast.warning(`TURN 쿼터 ${data.quota.percentage.toFixed(1)}% 사용 중`);
        }
        
        // TTL 75% 지점에서 갱신 (기본 24시간)
        const ttl = data.ttl || 86400;
        const renewalTime = ttl * 0.75 * 1000;
        
        console.log(`[TurnCredentials] ⏰ Scheduling renewal in ${(renewalTime / 1000 / 60).toFixed(1)} minutes`);
        
        // 기존 타이머 클리어
        if (renewalTimer.current) {
          clearTimeout(renewalTimer.current);
        }
        
        renewalTimer.current = setTimeout(() => {
          console.log('[TurnCredentials] 🔄 Auto-renewal triggered');
          requestCredentials();
        }, renewalTime);
        
        // 첫 요청인 경우에만 토스트
        if (retryCount.current === 0 && !lastCredentials.current) {
          toast.success('릴레이 서버 연결됨', { duration: 2000 });
        }
      }
      
      isRequestingRef.current = false;
    };
    
    // 응답 리스너 등록 (once 사용)
    socket.once('turn-credentials', handleCredentials);
    
    // 타임아웃 설정 (5초)
    const timeout = setTimeout(() => {
      socket.off('turn-credentials', handleCredentials);
      handleTimeout();
      isRequestingRef.current = false;
    }, 5000);
    
    // 응답 받으면 타임아웃 클리어
    socket.once('turn-credentials', () => {
      clearTimeout(timeout);
    });
    
  }, [waitForSocketConnection, updateIceServers]);
  
  /**
   * 에러 처리
   */
  const handleError = (data: TurnCredentialsResponse) => {
    console.error('[TurnCredentials] Error:', data.error, data.code);
    
    switch (data.code) {
      case 'AUTH_REQUIRED':
        toast.error('TURN 서버 인증 필요');
        break;
        
      case 'RATE_LIMIT':
        const retryAfter = (data as any).retryAfter || 60;
        toast.warning(`요청 제한. ${retryAfter}초 후 재시도`);
        
        // 재시도 예약
        renewalTimer.current = setTimeout(() => {
          console.log('[TurnCredentials] Retrying after rate limit...');
          requestCredentials();
        }, retryAfter * 1000);
        break;
        
      case 'QUOTA_EXCEEDED':
        toast.error('일일 대역폭 쿼터 초과');
        // Fallback to STUN only
        updateIceServers([
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]);
        break;
        
      case 'LIMIT_EXCEEDED':
        toast.error('연결 제한 초과');
        break;
        
      default:
        toast.error('TURN 자격증명 가져오기 실패');
        // 재시도 로직
        scheduleRetry();
    }
  };
  
  /**
   * 타임아웃 처리
   */
  const handleTimeout = () => {
    console.warn('[TurnCredentials] ⏱️ Request timeout');
    
    if (lastCredentials.current?.iceServers) {
      // 캐시된 자격증명 사용
      console.log('[TurnCredentials] 📦 Using cached credentials');
      updateIceServers(lastCredentials.current.iceServers);
    } else {
      // STUN only fallback
      console.log('[TurnCredentials] 🔄 Falling back to STUN only');
      updateIceServers([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]);
    }
    
    scheduleRetry();
  };
  
  /**
   * 재시도 스케줄링 (exponential backoff)
   */
  const scheduleRetry = () => {
    retryCount.current++;
    
    if (retryCount.current > 5) {
      console.error('[TurnCredentials] ❌ Max retries exceeded');
      toast.error('릴레이 서버 연결 불가');
      return;
    }
    
    // 지수 백오프: 2초, 4초, 8초, 16초, 32초
    const delay = Math.min(30000, Math.pow(2, retryCount.current) * 1000);
    console.log(`[TurnCredentials] 🔄 Retrying in ${delay / 1000}s (attempt ${retryCount.current})`);
    
    renewalTimer.current = setTimeout(() => {
      requestCredentials();
    }, delay);
  };
  
  /**
   * 수동 갱신
   */
  const refreshCredentials = useCallback(() => {
    console.log('[TurnCredentials] 🔄 Manual refresh requested');
    retryCount.current = 0;
    requestCredentials();
  }, [requestCredentials]);
  
  /**
   * 초기 요청 및 소켓 상태 감지
   */
  useEffect(() => {
    // 소켓이 연결되면 자동으로 요청
    if (socket && socket.connected && signalingStatus === 'connected') {
      console.log('[TurnCredentials] 🚀 Socket connected, requesting credentials');
      requestCredentials();
    }
    
    return () => {
      // 클린업
      if (renewalTimer.current) {
        clearTimeout(renewalTimer.current);
      }
      if (socketWaitTimer.current) {
        clearTimeout(socketWaitTimer.current);
      }
    };
  }, [socket, socket?.connected, signalingStatus, requestCredentials]);
  
  /**
   * 소켓 재연결 감지
   */
  useEffect(() => {
    if (!socket) return;
    
    const handleReconnect = () => {
      console.log('[TurnCredentials] 🔄 Socket reconnected, refreshing credentials');
      retryCount.current = 0;
      requestCredentials();
    };
    
    socket.on('reconnect', handleReconnect);
    
    return () => {
      socket.off('reconnect', handleReconnect);
    };
  }, [socket, requestCredentials]);
  
  return {
    refreshCredentials,
    lastCredentials: lastCredentials.current,
    isRequesting: isRequestingRef.current
  };
};
