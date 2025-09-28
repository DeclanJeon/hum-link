/**
 * @fileoverview 비디오 플레이어 컴포넌트 - 전체화면 및 자막 지원
 * @module components/FileStreaming/VideoPlayer
 */

import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Eye, 
  EyeOff, 
  RotateCw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubtitlePanel } from './SubtitlePanel';
import { SubtitleDisplay } from './SubtitleDisplay';
import { useSubtitleSync } from '@/hooks/useSubtitleSync';
import { useVideoFullscreen } from '@/hooks/useVideoFullscreen';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * VideoPlayer 컴포넌트 Props
 */
interface VideoPlayerProps {
  /** 비디오 엘리먼트 ref */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 비디오 상태 */
  videoState: {
    isPaused: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
  };
  /** 상태 변경 콜백 */
  onStateChange: (updates: any) => void;
  /** 스트리밍 중 여부 */
  isStreaming: boolean;
  /** 비디오 파일 */
  file?: File;
}

/**
 * 비디오 플레이어 컴포넌트
 * 파일 스트리밍, 자막, 전체화면 기능을 포함한 완전한 비디오 플레이어
 */
export const VideoPlayer = ({ 
  videoRef, 
  videoState, 
  onStateChange, 
  isStreaming,
  file
}: VideoPlayerProps) => {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const frameUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  
  // State
  const [showPreview, setShowPreview] = useState(true);
  const [localVideoState, setLocalVideoState] = useState(videoState);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  // 전체화면 Hook
  const { isFullscreen, toggleFullscreen, handleDoubleClick } = useVideoFullscreen(
    containerRef, 
    videoRef
  );
  
  // 자막 동기화 Hook
  useSubtitleSync(videoRef, isStreaming);
  
  /**
   * 비디오 파일 로드
   */
  useEffect(() => {
    if (!videoRef.current || !file) return;

    const loadVideo = async () => {
      try {
        // 기존 URL 정리
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        // 새 URL 생성
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        
        const video = videoRef.current!;
        
        // 비디오 초기화
        video.pause();
        video.removeAttribute('src');
        video.load();
        
        // 새 소스 설정
        video.src = url;
        video.load();
        
        console.log('[VideoPlayer] Video loaded from file:', file.name);
      } catch (error) {
        console.error('[VideoPlayer] Failed to load video:', error);
        onStateChange({ videoState: `error: ${error}` });
        toast.error('Failed to load video file');
      }
    };

    loadVideo();

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [file, videoRef, onStateChange]);
  
  /**
   * 비디오 이벤트 핸들러 설정
   */
  useEffect(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    
    const handleCanPlay = () => {
      setIsReady(true);
      setIsBuffering(false);
      console.log('[VideoPlayer] Video is ready to play');
    };
    
    const handleWaiting = () => {
      setIsBuffering(true);
    };
    
    const handlePlaying = () => {
      setIsBuffering(false);
    };
    
    const handleTimeUpdate = () => {
      setLocalVideoState(prev => ({
        ...prev,
        currentTime: video.currentTime
      }));
      onStateChange({ 
        videoTime: video.currentTime,
        videoState: video.paused ? 'paused' : 'playing'
      });
    };
    
    const handlePlay = () => {
      setLocalVideoState(prev => ({ ...prev, isPaused: false }));
      onStateChange({ videoState: 'playing' });
      
      // 스트리밍 중일 때 프레임 카운트
      if (isStreaming && !frameUpdateInterval.current) {
        frameUpdateInterval.current = setInterval(() => {
          onStateChange({ frameCount: 1 });
        }, 1000 / 30);
      }
    };
    
    const handlePause = () => {
      setLocalVideoState(prev => ({ ...prev, isPaused: true }));
      onStateChange({ videoState: 'paused' });
      
      if (frameUpdateInterval.current) {
        clearInterval(frameUpdateInterval.current);
        frameUpdateInterval.current = null;
      }
    };
    
    const handleLoadedMetadata = () => {
      setLocalVideoState(prev => ({
        ...prev,
        duration: video.duration
      }));
    };
    
    const handleEnded = () => {
      setLocalVideoState(prev => ({ ...prev, isPaused: true }));
      onStateChange({ videoState: 'ended' });
      
      if (frameUpdateInterval.current) {
        clearInterval(frameUpdateInterval.current);
        frameUpdateInterval.current = null;
      }
    };
    
    const handleError = (e: Event) => {
      const video = e.target as HTMLVideoElement;
      const error = video.error;
      
      let errorMessage = 'Unknown error';
      if (error) {
        switch (error.code) {
          case 1: errorMessage = 'Video loading aborted'; break;
          case 2: errorMessage = 'Network error'; break;
          case 3: errorMessage = 'Video decoding error'; break;
          case 4: errorMessage = 'Video format not supported'; break;
        }
      }
      
      console.error('[VideoPlayer] Video error:', errorMessage);
      setIsReady(false);
      onStateChange({ videoState: `error: ${errorMessage}` });
    };
    
    // 이벤트 리스너 등록
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    
    return () => {
      // 이벤트 리스너 정리
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      
      if (frameUpdateInterval.current) {
        clearInterval(frameUpdateInterval.current);
      }
    };
  }, [videoRef, onStateChange, isStreaming]);
  
  /**
   * 재생/일시정지 토글
   */
  const togglePlayPause = async () => {
    if (!videoRef.current || !isReady) return;
    
    try {
      if (videoRef.current.paused) {
        await videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    } catch (error) {
      console.error('Playback toggle failed:', error);
      if ((error as any).name === 'NotAllowedError') {
        toast.error('Auto-play blocked. Please click play to start.');
      }
    }
  };
  
  /**
   * 볼륨 변경
   */
  const handleVolumeChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.volume = value[0] / 100;
      setLocalVideoState(prev => ({ ...prev, volume: value[0] }));
    }
  };
  
  /**
   * 음소거 토글
   */
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setLocalVideoState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };
  
  /**
   * 시간 탐색
   */
  const handleSeek = (value: number[]) => {
    if (videoRef.current && localVideoState.duration) {
      const seekTime = (value[0] / 100) * localVideoState.duration;
      videoRef.current.currentTime = seekTime;
    }
  };
  
  /**
   * 스킵 기능
   */
  const skipVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0, 
        Math.min(localVideoState.duration, videoRef.current.currentTime + seconds)
      );
    }
  };
  
  /**
   * 재생 속도 변경
   */
  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };
  
  /**
   * 비디오 재시작
   */
  const restartVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };
  
  /**
   * 시간 포맷팅
   */
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const progress = localVideoState.duration > 0 
    ? (localVideoState.currentTime / localVideoState.duration) * 100 
    : 0;
  
  return (
    <div className="video-player-container space-y-3">
      {/* 비디오 컨테이너 */}
      <div 
        ref={containerRef}
        className={cn(
          "relative bg-black rounded-lg overflow-hidden group",
          isFullscreen && "fixed inset-0 z-50 rounded-none"
        )}
        onDoubleClick={handleDoubleClick}
      >
        {/* 비디오 엘리먼트 */}
        {showPreview && (
          <video
            ref={videoRef}
            className={cn(
              "w-full",
              isFullscreen ? "h-full object-contain" : "h-auto max-h-[500px]"
            )}
            controls={false}
            playsInline
            muted={localVideoState.isMuted}
          />
        )}
        
        {/* 자막 오버레이 */}
        <SubtitleDisplay 
          videoRef={videoRef} 
          isFullscreen={isFullscreen} 
        />
        
        {/* 버퍼링 인디케이터 */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}
        
        {/* 스트리밍 인디케이터 */}
        {isStreaming && !isFullscreen && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
        )}
        
        {/* 전체화면 버튼 */}
        <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            onClick={toggleFullscreen}
            size="sm"
            variant="ghost"
            className="bg-black/60 hover:bg-black/80 text-white"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {/* 더블클릭 힌트 */}
        {!isFullscreen && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1 rounded">
            Double-click for fullscreen • Press F
          </div>
        )}
      </div>
      
      {/* 자막 컨트롤 패널 (전체화면이 아닐 때만) */}
      {!isFullscreen && (
        <SubtitlePanel 
          videoRef={videoRef} 
          isStreaming={isStreaming} 
        />
      )}
      
      {/* 비디오 컨트롤 (전체화면이 아닐 때만) */}
      {!isFullscreen && (
        <div className="space-y-3 p-4 bg-secondary/50 rounded-lg">
          {/* 미리보기 토글 */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                title={showPreview ? 'Hide preview' : 'Show preview'}
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="ml-2">{showPreview ? 'Hide' : 'Show'} Preview</span>
              </Button>
              
              {/* 재생 속도 */}
              <select
                value={playbackRate}
                onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
                className="px-2 py-1 text-sm border rounded"
                disabled={!isReady}
              >
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </div>
            
            {/* 상태 표시 */}
            <div className="flex items-center gap-2">
              {!isReady && (
                <span className="text-xs text-yellow-500">Loading video...</span>
              )}
              {isReady && !isBuffering && (
                <span className="text-xs text-green-500">Ready</span>
              )}
              {isBuffering && (
                <span className="text-xs text-blue-500 animate-pulse">Buffering...</span>
              )}
              {isStreaming && (
                <span className="text-xs text-red-500 font-bold">STREAMING</span>
              )}
            </div>
          </div>
          
          {/* 스트리밍 알림 */}
          {isStreaming && (
            <Alert>
              <AlertDescription className="text-xs">
                Video is being streamed to peers. Playback controls affect all viewers.
              </AlertDescription>
            </Alert>
          )}
          
          {/* 재생 컨트롤 */}
          <div className="flex items-center gap-2">
            <Button
              onClick={restartVideo}
              size="sm"
              variant="outline"
              title="Restart"
              disabled={!isReady}
            >
              <RotateCw className="w-4 h-4" />
            </Button>
            
            <Button
              onClick={() => skipVideo(-10)}
              size="sm"
              variant="outline"
              title="Skip back 10 seconds"
              disabled={!isReady}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            
            <Button
              onClick={togglePlayPause}
              size="sm"
              variant="default"
              className="min-w-[80px]"
              disabled={!isReady}
            >
              {localVideoState.isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  Play
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  Pause
                </>
              )}
            </Button>
            
            <Button
              onClick={() => skipVideo(10)}
              size="sm"
              variant="outline"
              title="Skip forward 10 seconds"
              disabled={!isReady}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            
            {/* 시간 슬라이더 */}
            <div className="flex-1 px-4">
              <Slider
                value={[progress]}
                onValueChange={handleSeek}
                max={100}
                step={0.1}
                className="w-full"
                disabled={!isReady || isStreaming}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{formatTime(localVideoState.currentTime)}</span>
                <span>{formatTime(localVideoState.duration)}</span>
              </div>
            </div>
          </div>
          
          {/* 볼륨 컨트롤 */}
          <div className="flex items-center gap-2">
            <Button
              onClick={toggleMute}
              size="sm"
              variant="ghost"
              disabled={!isReady}
            >
              {localVideoState.isMuted ? 
                <VolumeX className="w-4 h-4" /> : 
                <Volume2 className="w-4 h-4" />
              }
            </Button>
            <Slider
              value={[localVideoState.volume]}
              onValueChange={handleVolumeChange}
              max={100}
              step={1}
              className="w-32"
              disabled={localVideoState.isMuted || !isReady}
            />
            <span className="text-xs w-10">{localVideoState.volume}%</span>
          </div>
        </div>
      )}
    </div>
  );
};