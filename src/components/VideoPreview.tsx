// frontend/src/components/VideoPreview.tsx
/**
 * @fileoverview 비디오 프리뷰 컴포넌트 - 로컬/원격 비디오 표시
 * @module components/VideoPreview
 */

import { useEffect, useRef } from "react";
import { SubtitleDisplay } from "./FileStreaming/SubtitleDisplay";
import { useVideoFullscreen } from "@/hooks/useVideoFullscreen";
import { useSubtitleStore } from "@/stores/useSubtitleStore";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";

interface VideoPreviewProps {
  stream: MediaStream | null;
  isVideoEnabled: boolean;
  nickname: string;
  audioLevel?: number;
  showVoiceFrame?: boolean;
  isLocalVideo?: boolean;
  showSubtitles?: boolean;
}

/**
 * 비디오 프리뷰 컴포넌트
 * 로컬 및 원격 비디오를 표시합니다
 */
export const VideoPreview = ({
  stream,
  isVideoEnabled,
  nickname,
  audioLevel = 0,
  showVoiceFrame = false,
  isLocalVideo = false,
  showSubtitles = false,
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 전체화면 Hook
  const { isFullscreen, handleDoubleClick } = useVideoFullscreen(containerRef, videoRef);
  
  // 자막 표시 여부 (원격만)
  const { isEnabled: subtitlesEnabled } = useSubtitleStore();
  const shouldShowSubtitles = showSubtitles && subtitlesEnabled && !isLocalVideo;

  /**
   * 🔥 개선된 스트림 업데이트 로직
   */
  useEffect(() => {
    if (!videoRef.current) {
      console.warn('[VideoPreview] videoRef가 없습니다');
      return;
    }
    
    const video = videoRef.current;
    const currentSrc = video.srcObject;
    
    // 스트림이 없는 경우
    if (!stream) {
      if (currentSrc) {
        console.log(`[VideoPreview] ${nickname} - 스트림 제거 중...`);
        video.srcObject = null;
      }
      return;
    }
    
    // 스트림 변경 감지
    if (currentSrc !== stream) {
      console.log(`[VideoPreview] ${nickname} - 스트림 변경 감지`);
      console.log(`[VideoPreview] 이전 스트림:`, currentSrc);
      console.log(`[VideoPreview] 새 스트림:`, stream);
      
      // 이전 스트림 정리 (srcObject만 해제)
      if (currentSrc instanceof MediaStream) {
        video.srcObject = null;
        console.log(`[VideoPreview] ${nickname} - 이전 srcObject 제거`);
      }
      
      // 새 스트림 설정
      video.srcObject = stream;
      console.log(`[VideoPreview] ${nickname} - 새 srcObject 설정 완료`);
      
      // 로컬 비디오가 아니면 자동 재생
      if (!isLocalVideo) {
        // 약간의 지연 후 재생 시도 (iOS 호환성)
        setTimeout(() => {
          if (video.paused) {
            video.play().catch(err => {
              console.warn(`[VideoPreview] ${nickname} - 자동 재생 실패:`, err);
            });
          }
        }, 100);
      }
    } else {
      // 스트림은 같지만 트랙이 변경되었을 수 있음
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        console.log(`[VideoPreview] ${nickname} - 트랙 상태: ${videoTracks[0].label}, enabled=${videoTracks[0].enabled}, readyState=${videoTracks[0].readyState}`);
      }
    }
  }, [stream, isLocalVideo, nickname]);

  /**
   * 비디오 활성화 상태 모니터링
   */
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    // 트랙 종료 이벤트 리스너
    const handleEnded = () => {
      console.log(`[VideoPreview] ${nickname} - 비디오 트랙 종료됨`);
    };
    
    videoTrack.addEventListener('ended', handleEnded);
    
    return () => {
      videoTrack.removeEventListener('ended', handleEnded);
    };
  }, [stream, nickname]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full h-full bg-muted rounded-lg overflow-hidden flex items-center justify-center shadow-md border border-border/20 group",
        isFullscreen && "fixed inset-0 z-50 rounded-none bg-black"
      )}
      onDoubleClick={handleDoubleClick}
      tabIndex={0}
    >
      {/* 비디오 요소 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocalVideo}
        className={cn(
          "transition-opacity duration-300",
          isFullscreen ? "w-full h-full object-contain" : "w-full h-full object-cover",
          stream && isVideoEnabled ? "opacity-100" : "opacity-0"
        )}
      />

      {/* 비디오가 없을 때 아바타 */}
      {(!stream || !isVideoEnabled) && !isFullscreen && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary/50 to-muted">
          <div className="w-20 h-20 lg:w-24 lg:h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-3xl lg:text-4xl font-bold text-primary">
              {nickname.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      
      {/* 자막 표시 (원격만) */}
      {shouldShowSubtitles && (
        <SubtitleDisplay
          videoRef={videoRef}
          isFullscreen={isFullscreen}
        />
      )}

      {/* 닉네임 표시 */}
      <div className={cn(
        "absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-white",
        isFullscreen && "bottom-4 left-4 text-sm px-4 py-2"
      )}>
        {nickname} {isLocalVideo && "(You)"}
      </div>
      
      {/* 전체화면 힌트 (호버 시) */}
      {!isFullscreen && (
        <>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/60 backdrop-blur-sm p-2 rounded-lg">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
          </div>
          
          <div className="absolute bottom-2 right-2 text-xs text-white/50 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-2 py-1 rounded">
            Double-click or Press F
          </div>
        </>
      )}
      
      {/* 전체화면 종료 힌트 */}
      {isFullscreen && (
        <div className="absolute top-4 right-4 text-sm text-white/70 bg-black/60 px-3 py-2 rounded">
          Press ESC to exit fullscreen
        </div>
      )}
    </div>
  );
};
