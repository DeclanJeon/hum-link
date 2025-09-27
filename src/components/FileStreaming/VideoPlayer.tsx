import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Eye, EyeOff } from 'lucide-react';

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
}

export const VideoPlayer = ({ videoRef, videoState, onStateChange }: VideoPlayerProps) => {
  const [showPreview, setShowPreview] = useState(true);
  const [localVideoState, setLocalVideoState] = useState(videoState);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    
    // 비디오 준비 상태 체크
    const handleCanPlay = () => {
      setIsReady(true);
      console.log('[VideoPlayer] Video is ready to play');
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
    };
    
    const handlePause = () => {
      setLocalVideoState(prev => ({ ...prev, isPaused: true }));
      onStateChange({ videoState: 'paused' });
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
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoRef, onStateChange]);

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
    <div className="space-y-3 p-4 bg-secondary/50 rounded-lg">
      {/* Preview Toggle */}
      <div className="flex justify-between items-center mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          title={showPreview ? 'Hide preview' : 'Show preview'}
        >
          {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span className="ml-2">{showPreview ? 'Hide' : 'Show'} Preview</span>
        </Button>
        
        {!isReady && (
          <span className="text-xs text-yellow-500">Loading video...</span>
        )}
        {isReady && (
          <span className="text-xs text-green-500">Ready</span>
        )}
      </div>

      {/* Video Element - Always rendered */}
      <div className={showPreview ? 'block' : 'hidden'}>
        <div className="bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-auto max-h-[300px]"
            controls={false}
            playsInline
            muted={localVideoState.isMuted}
          />
        </div>
      </div>
      
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
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
            disabled={!isReady}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatTime(localVideoState.currentTime)}</span>
            <span>{formatTime(localVideoState.duration)}</span>
          </div>
        </div>
      </div>
      
      {/* Volume Controls */}
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