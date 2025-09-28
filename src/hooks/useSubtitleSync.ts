/**
 * @fileoverview 자막 동기화 Hook - 비디오 자막 동기화
 * @module hooks/useSubtitleSync
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSubtitleStore } from '@/stores/useSubtitleStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { throttle } from 'lodash';

/**
 * 자막 동기화 Hook
 * 비디오 재생과 자막을 동기화하고 P2P로 브로드캐스트
 * 
 * @param videoRef - 비디오 엘리먼트 ref
 * @param isStreaming - 파일 스트리밍 여부
 */
export const useSubtitleSync = (
  videoRef: React.RefObject<HTMLVideoElement>,
  isStreaming: boolean
): void => {
  const {
    syncWithVideo,
    broadcastSubtitleState,
    activeTrackId,
    tracks,
    currentCue
  } = useSubtitleStore();
  const { sendToAllPeers } = usePeerConnectionStore();
  const { fileType } = useFileStreamingStore();
  
  const animationIdRef = useRef<number>();
  const lastBroadcastTime = useRef<number>(0);
  const lastCueId = useRef<string | null>(null);
  
  /**
   * P2P 자막 동기화 브로드캐스트 (throttled)
   */
  const broadcastSync = useCallback(
    throttle((currentTime: number, cueId: string | null) => {
      if (!isStreaming || fileType !== 'video') return;
      
      const packet = {
        type: 'subtitle-sync',
        payload: {
          currentTime,
          cueId,
          activeTrackId,
          timestamp: Date.now()
        }
      };
      
      sendToAllPeers(JSON.stringify(packet));
      
      console.log(`[SubtitleSync] Broadcasting: time=${(currentTime/1000).toFixed(2)}s, cue=${cueId}`);
    }, 100), // 100ms throttle
    [isStreaming, fileType, activeTrackId, sendToAllPeers]
  );
  
  /**
   * 동기화 루프
   */
  const syncLoop = useCallback((): void => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime * 1000;
    syncWithVideo(currentTime);
    
    // 파일 스트리밍 중이고 자막이 있으면 브로드캐스트
    if (isStreaming && fileType === 'video' && activeTrackId) {
      const { currentCue } = useSubtitleStore.getState();
      
      // 큐가 변경되었을 때만 브로드캐스트
      if (currentCue?.id !== lastCueId.current) {
        broadcastSync(currentTime, currentCue?.id || null);
        lastCueId.current = currentCue?.id || null;
      }
    }
    
    animationIdRef.current = requestAnimationFrame(syncLoop);
  }, [videoRef, isStreaming, fileType, activeTrackId, syncWithVideo, broadcastSync]);
  
  /**
   * 비디오 재생 시작
   */
  const handlePlay = useCallback((): void => {
    console.log('[SubtitleSync] Video play started');
    syncLoop();
    
    // 재생 시작 시 즉시 브로드캐스트
    if (isStreaming && fileType === 'video') {
      const currentTime = videoRef.current?.currentTime || 0;
      broadcastSync(currentTime * 1000, currentCue?.id || null);
    }
  }, [syncLoop, isStreaming, fileType, broadcastSync, currentCue]);
  
  /**
   * 비디오 일시정지
   */
  const handlePause = useCallback((): void => {
    console.log('[SubtitleSync] Video paused');
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
    
    // 일시정지 시 현재 상태 브로드캐스트
    if (isStreaming && fileType === 'video' && videoRef.current) {
      const currentTime = videoRef.current.currentTime * 1000;
      broadcastSync(currentTime, currentCue?.id || null);
    }
  }, [isStreaming, fileType, broadcastSync, currentCue, videoRef]);
  
  /**
   * 비디오 시크
   */
  const handleSeeked = useCallback((): void => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime * 1000;
    syncWithVideo(currentTime);
    
    if (isStreaming && fileType === 'video') {
      // Seek 이벤트 전송
      sendToAllPeers(JSON.stringify({
        type: 'subtitle-seek',
        payload: { 
          currentTime,
          timestamp: Date.now()
        }
      }));
      
      console.log(`[SubtitleSync] Seeked to ${(currentTime/1000).toFixed(2)}s`);
    }
  }, [videoRef, isStreaming, fileType, syncWithVideo, sendToAllPeers]);
  
  /**
   * 시간 업데이트 (일시정지 상태에서)
   */
  const handleTimeUpdate = useCallback((): void => {
    if (!videoRef.current || !videoRef.current.paused) return;
    
    const currentTime = videoRef.current.currentTime * 1000;
    syncWithVideo(currentTime);
  }, [videoRef, syncWithVideo]);
  
  /**
   * 자막 점프 이벤트 핸들러
   */
  const handleSubtitleJump = useCallback((event: CustomEvent): void => {
    if (!videoRef.current) return;
    
    const { time } = event.detail;
    videoRef.current.currentTime = time;
    
    console.log(`[SubtitleSync] Jumped to subtitle at ${time}s`);
  }, [videoRef]);
  
  /**
   * 자막 트랙 변경 시 브로드캐스트
   */
  useEffect(() => {
    if (!isStreaming || fileType !== 'video' || !activeTrackId) return;
    
    const track = tracks.get(activeTrackId);
    if (!track) return;
    
    // 자막 트랙 정보 브로드캐스트
    const { broadcastTrack } = useSubtitleStore.getState();
    broadcastTrack(activeTrackId);
    
    console.log(`[SubtitleSync] Broadcasting subtitle track: ${track.label}`);
  }, [isStreaming, fileType, activeTrackId, tracks]);

  /**
   * 비디오 이벤트 리스너 등록/해제
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // 이벤트 리스너 등록
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    // 커스텀 자막 점프 이벤트
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
  
  /**
   * 스트리밍 상태 변경 시 처리
   */
  useEffect(() => {
    if (!isStreaming) {
      // 스트리밍 종료 시 동기화 정지
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      lastCueId.current = null;
    }
  }, [isStreaming]);
};