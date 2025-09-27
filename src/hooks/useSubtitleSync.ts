/**
 * @fileoverview 자막 동기화 Hook
 * @module hooks/useSubtitleSync
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSubtitleStore } from '@/stores/useSubtitleStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { throttle } from 'lodash';

/**
 * 자막 동기화 Hook
 * 비디오 재생과 자막을 동기화하고 P2P로 상태 공유
 * 
 * @param videoRef - 비디오 엘리먼트 ref
 * @param isStreaming - 스트리밍 중 여부
 */
export const useSubtitleSync = (
  videoRef: React.RefObject<HTMLVideoElement>,
  isStreaming: boolean
): void => {
  const { syncWithVideo, broadcastSubtitleState } = useSubtitleStore();
  const { sendToAllPeers } = usePeerConnectionStore();
  
  // 애니메이션 프레임 ID ref
  const animationIdRef = useRef<number>();
  
  /**
   * P2P 동기화 브로드캐스트 (throttled)
   * 100ms마다 최대 1회 전송
   */
  const broadcastSync = useRef(
    throttle((currentTime: number, cueId: string | null): void => {
      if (!isStreaming) return;
      
      const packet = {
        type: 'subtitle-sync',
        payload: {
          currentTime,
          cueId,
          timestamp: Date.now()
        }
      };
      
      sendToAllPeers(JSON.stringify(packet));
    }, 100)
  ).current;
  
  /**
   * 동기화 루프
   * RequestAnimationFrame을 사용하여 부드러운 자막 전환
   */
  const syncLoop = useCallback((): void => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime * 1000; // ms 변환
    syncWithVideo(currentTime);
    
    // 스트리밍 중이면 동기화 정보 전송
    if (isStreaming) {
      const { currentCue } = useSubtitleStore.getState();
      broadcastSync(currentTime, currentCue?.id || null);
    }
    
    animationIdRef.current = requestAnimationFrame(syncLoop);
  }, [videoRef, isStreaming, syncWithVideo, broadcastSync]);
  
  /**
   * 비디오 이벤트 핸들러
   */
  const handlePlay = useCallback((): void => {
    syncLoop();
  }, [syncLoop]);
  
  const handlePause = useCallback((): void => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
  }, []);
  
  const handleSeeked = useCallback((): void => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime * 1000;
    syncWithVideo(currentTime);
    
    if (isStreaming) {
      // Seek 이벤트 즉시 전송
      sendToAllPeers(JSON.stringify({
        type: 'subtitle-seek',
        payload: { 
          currentTime,
          timestamp: Date.now()
        }
      }));
    }
  }, [videoRef, isStreaming, syncWithVideo, sendToAllPeers]);
  
  const handleTimeUpdate = useCallback((): void => {
    if (!videoRef.current || !videoRef.current.paused) return;
    
    // 일시정지 상태에서만 timeupdate 처리
    const currentTime = videoRef.current.currentTime * 1000;
    syncWithVideo(currentTime);
  }, [videoRef, syncWithVideo]);
  
  /**
   * 자막 점프 이벤트 처리
   */
  const handleSubtitleJump = useCallback((event: CustomEvent): void => {
    if (!videoRef.current) return;
    
    const { time } = event.detail;
    videoRef.current.currentTime = time;
  }, [videoRef]);
  
  /**
   * 이벤트 리스너 등록/해제
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // 비디오 이벤트 리스너
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    // 자막 점프 이벤트 리스너
    window.addEventListener('subtitle-jump', handleSubtitleJump as any);
    
    // 초기 동기화
    if (!video.paused) {
      syncLoop();
    }
    
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      
      window.removeEventListener('subtitle-jump', handleSubtitleJump as any);
    };
  }, [
    videoRef,
    handlePlay,
    handlePause,
    handleSeeked,
    handleTimeUpdate,
    handleSubtitleJump,
    syncLoop
  ]);
};
