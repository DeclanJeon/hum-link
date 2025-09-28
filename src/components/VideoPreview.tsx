/**
 * @fileoverview 통합 VideoPreview 컴포넌트 - 로컬/원격 모두 지원
 * @module components/VideoPreview
 */

import { useEffect, useRef } from "react";
import { VoiceVisualizer } from "./VoiceVisualizer";
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
  showSubtitles?: boolean; // 자막 표시 여부 (원격 비디오용)
}

/**
 * 통합 비디오 프리뷰 컴포넌트
 * 로컬 및 원격 스트림 모두 지원
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
  
  // 자막 상태 (원격 비디오에서만 사용)
  const { isEnabled: subtitlesEnabled } = useSubtitleStore();
  const shouldShowSubtitles = showSubtitles && subtitlesEnabled && !isLocalVideo;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full h-full bg-muted rounded-lg overflow-hidden flex items-center justify-center shadow-md border border-border/20 group",
        isFullscreen && "fixed inset-0 z-50 rounded-none bg-black"
      )}
      onDoubleClick={handleDoubleClick}
      tabIndex={0} // 키보드 포커스 가능
    >
      {/* 비디오 엘리먼트 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocalVideo} // 로컬 비디오만 음소거
        className={cn(
          "transition-opacity duration-300",
          isFullscreen ? "w-full h-full object-contain" : "w-full h-full object-cover",
          stream && isVideoEnabled ? "opacity-100" : "opacity-0"
        )}
      />

      {/* 비디오 없을 때 플레이스홀더 */}
      {(!stream || !isVideoEnabled) && !isFullscreen && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary/50 to-muted">
          <div className="w-20 h-20 lg:w-24 lg:h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-3xl lg:text-4xl font-bold text-primary">
              {nickname.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      
      {/* 자막 오버레이 (원격 비디오용) */}
      {shouldShowSubtitles && (
        <SubtitleDisplay
          videoRef={videoRef}
          isFullscreen={isFullscreen}
        />
      )}
      
      {/* 음성 시각화 */}
      {showVoiceFrame && !isFullscreen && (
        <VoiceVisualizer
          audioLevel={audioLevel}
          isActive={true}
          position="frame"
        />
      )}

      {/* 닉네임 오버레이 */}
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
            Double-click • Press F
          </div>
        </>
      )}
      
      {/* 전체화면 시 ESC 안내 */}
      {isFullscreen && (
        <div className="absolute top-4 right-4 text-sm text-white/70 bg-black/60 px-3 py-2 rounded">
          Press ESC to exit fullscreen
        </div>
      )}
    </div>
  );
};
