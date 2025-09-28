/**
 * @fileoverview 비디오 전체화면 Hook
 * @module hooks/useVideoFullscreen
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * 비디오 전체화면 관리 Hook
 * @param containerRef - 전체화면 대상 컨테이너 ref
 * @param videoRef - 비디오 엘리먼트 ref (선택적)
 * @returns 전체화면 상태 및 제어 함수
 */
export const useVideoFullscreen = (
  containerRef: React.RefObject<HTMLElement>,
  videoRef?: React.RefObject<HTMLVideoElement>
) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  /**
   * 전체화면 토글
   */
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        // 컨테이너 또는 비디오 엘리먼트를 전체화면으로
        const element = containerRef.current || videoRef?.current;
        if (!element) {
          console.warn('[Fullscreen] No element to fullscreen');
          return;
        }
        
        await element.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('[Fullscreen] Error toggling fullscreen:', error);
      // 사용자에게 알림 (선택적)
      if ((error as Error).message.includes('API can only be initiated by a user gesture')) {
        toast.error('Fullscreen requires user interaction');
      }
    }
  }, [containerRef, videoRef]);
  
  /**
   * 더블클릭 핸들러
   */
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    toggleFullscreen();
  }, [toggleFullscreen]);
  
  /**
   * 키보드 단축키 핸들러
   */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 입력 필드에 포커스가 있으면 무시
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // 컨테이너나 비디오가 포커스되어 있거나 마우스가 올라가 있을 때만
      const element = containerRef.current || videoRef?.current;
      if (!element) return;
      
      // F키로 전체화면 토글
      if (e.key.toLowerCase() === 'f') {
        // 마우스가 비디오 영역 위에 있는지 확인
        const isHovered = element.matches(':hover');
        if (isHovered) {
          e.preventDefault();
          toggleFullscreen();
        }
      }
      
      // ESC는 브라우저가 자동으로 처리
    };
    
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [containerRef, videoRef, toggleFullscreen]);
  
  /**
   * 전체화면 변경 감지
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);
  
  return {
    isFullscreen,
    toggleFullscreen,
    handleDoubleClick
  };
};
