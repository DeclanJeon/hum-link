/**
 * @fileoverview 비디오 플레이어 컴포넌트 초기화 개선
 * @module components/FileStreaming/VideoPlayer
 */

import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Eye, EyeOff, RotateCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubtitlePanel } from './SubtitlePanel';
import { SubtitleDisplay } from './SubtitleDisplay';
import { useSubtitleSync } from '@/hooks/useSubtitleSync';
import { toast } from 'sonner';

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoState: {
    isPaused: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
  };
  onStateChange: (updates: any) => void;
  isStreaming: boolean;
  file?: File;
}

export const VideoPlayer = ({ 
  videoRef, 
  videoState, 
  onStateChange, 
  isStreaming,
  file
}: VideoPlayerProps) => {
  const [showPreview, setShowPreview] = useState(true);
  const [localVideoState, setLocalVideoState] = useState(videoState);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frameUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // 전체화면 감지
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 자막 동기화 Hook 사용
  useSubtitleSync(videoRef, isStreaming);

  // 비디오 파일 로드 처리
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
        
        // 비디오 소스 설정 전 초기화
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
        onStateChange({ 
          errors: ['Auto-play blocked. Please click play to start.']
        });
      }
    }
  };
  
  const handleVolumeChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.volume = value[0] / 100;
      setLocalVideoState(prev => ({ ...prev, volume: value[0] }));
    }
  };
  
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setLocalVideoState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };
  
  const handleSeek = (value: number[]) => {
    if (videoRef.current && localVideoState.duration) {
      const seekTime = (value[0] / 100) * localVideoState.duration;
      videoRef.current.currentTime = seekTime;
    }
  };
  
  const skipVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0, 
        Math.min(localVideoState.duration, videoRef.current.currentTime + seconds)
      );
    }
  };
  
  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };
  
  const restartVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };
  
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
      <div className="relative bg-black rounded-lg overflow-hidden">
        {showPreview && (
          <video
            ref={videoRef}
            className="w-full h-auto max-h-[500px]"
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
        
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}
      </div>
      
      {/* 자막 컨트롤 패널 */}
      <SubtitlePanel
        videoRef={videoRef}
        isStreaming={isStreaming}
      />
      
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
      
      {isStreaming && (
        <Alert>
          <AlertDescription className="text-xs">
            Video is being streamed to {videoRef.current?.paused ? '0' : 'active'} peers.
            Playback controls affect all viewers.
          </AlertDescription>
        </Alert>
      )}
      
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
      
      <div className="flex items-center gap-2">
        <Button
          onClick={toggleMute}
          size="sm"
          variant="ghost"
          disabled={!isReady}
        >
          {localVideoState.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
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
  );
};
