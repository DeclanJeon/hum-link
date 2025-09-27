/**
 * @fileoverview 파일 스트리밍 Hook 수정
 * @module hooks/useFileStreaming
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { StreamStateManager } from '@/services/streamStateManager';
import { VideoLoader } from '@/services/videoLoader';
import { RecoveryManager } from '@/services/recoveryManager';

interface UseFileStreamingProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  webRTCManager: any;
  localStream: MediaStream | null;
  peers: Map<string, any>;
  isStreaming: boolean;
  setIsStreaming: (value: boolean) => void;
  streamQuality: 'low' | 'medium' | 'high';
  fileType: string;
}

interface DebugInfo {
  canvasReady: boolean;
  streamCreated: boolean;
  streamActive: boolean;
  trackCount: number;
  peersConnected: number;
  videoState: string;
  videoTime: number;
  fps: number;
  frameDrops: number;
  audioEnabled: boolean;
  errors: string[];
}

interface OriginalTrackState {
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

export const useFileStreaming = ({
  canvasRef,
  videoRef,
  webRTCManager,
  localStream,
  peers,
  isStreaming,
  setIsStreaming,
  streamQuality,
  fileType
}: UseFileStreamingProps) => {
  // Refs
  const streamRef = useRef<MediaStream | null>(null);
  const fileStreamRef = useRef<MediaStream | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const videoLoadedRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const originalTracksRef = useRef<OriginalTrackState>({
    video: null,
    audio: null,
    videoEnabled: false,
    audioEnabled: false
  });
  
  // Managers
  const streamStateManager = useRef(new StreamStateManager());
  const videoLoader = useRef(new VideoLoader());
  const recoveryManager = useRef(new RecoveryManager());
  
  const recoveryAttemptRef = useRef<boolean>(false);
  
  // State
  const [videoState, setVideoState] = useState({
    isPaused: true,
    currentTime: 0,
    duration: 0,
    volume: 50,
    isMuted: false
  });
  
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    canvasReady: false,
    streamCreated: false,
    streamActive: false,
    trackCount: 0,
    peersConnected: 0,
    videoState: 'not loaded',
    videoTime: 0,
    fps: 0,
    frameDrops: 0,
    audioEnabled: false,
    errors: []
  });
  
  // FPS 모니터링
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastFrameTimeRef.current;
      
      if (elapsed > 0) {
        const fps = Math.round((frameCountRef.current / elapsed) * 1000);
        setDebugInfo(prev => ({ ...prev, fps }));
      }
      
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const updateDebugInfo = useCallback((updates: Partial<DebugInfo>) => {
    setDebugInfo(prev => ({ ...prev, ...updates }));
  }, []);
  
  const logError = useCallback((error: string) => {
    console.error(`[FileStreaming] ${error}`);
    updateDebugInfo({
      errors: [...debugInfo.errors, `${new Date().toLocaleTimeString()}: ${error}`].slice(-5)
    });
  }, [debugInfo.errors, updateDebugInfo]);
  
  const cleanupObjectUrl = useCallback(() => {
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
  }, []);

  // Canvas fallback 스트림 생성
  const createCanvasStreamFromVideo = async (
    video: HTMLVideoElement,
    fps: number
  ): Promise<MediaStream | null> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const stream = (canvas as any).captureStream(fps);
    
    const drawFrame = () => {
      if (video.paused || video.ended) return;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    };
    
    video.addEventListener('play', drawFrame);
    drawFrame();
    
    return stream;
  };

  /**
   * 파일 선택 처리
   */
  const handleFileSelect = async (
    file: File,
    setSelectedFile: (file: File) => void,
    setFileType: (type: string) => void
  ) => {
    try {
      if (isStreaming) {
        await stopStreaming();
      }
      
      videoLoadedRef.current = false;
      cleanupObjectUrl();
      
      setSelectedFile(file);
      
      if (file.type.startsWith('video/')) {
        setFileType('video');
        
        // videoRef가 준비될 때까지 대기
        if (!videoRef?.current) {
          console.log('[FileStreaming] Waiting for video element to be ready...');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        await loadVideoWithRecovery(file);
      } else if (file.type === 'application/pdf') {
        setFileType('pdf');
        await loadPDF(file);
      } else if (file.type.startsWith('image/')) {
        setFileType('image');
        await loadImage(file);
      } else {
        setFileType('other');
        await loadGenericFile(file);
      }
      
      toast.success(`File loaded: ${file.name}`);
      updateDebugInfo({ canvasReady: true });
    } catch (error) {
      logError(`Failed to load file: ${error}`);
      
      const result = await recoveryManager.current.handleFileLoadFailure(
        error as Error,
        file
      );
      
      if (result.suggestion) {
        toast.error(result.suggestion);
      } else {
        toast.error('Failed to load file');
      }
    }
  };

  /**
   * 비디오 파일 로드 (복구 로직 포함)
   * @param file - 비디오 파일
   */
  const loadVideoWithRecovery = async (file: File) => {
    // videoRef 체크 개선
    if (!videoRef?.current) {
      logError('Video element not found - videoRef is null or undefined');
      toast.error('Video player not initialized');
      return;
    }
    
    const validation = VideoLoader.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    try {
      // 비디오 소스 설정
      const url = URL.createObjectURL(file);
      currentObjectUrlRef.current = url;
      
      const video = videoRef.current;
      video.src = url;
      
      // 비디오 로드 대기
      await new Promise((resolve, reject) => {
        const handleLoadedData = () => {
          video.removeEventListener('loadeddata', handleLoadedData);
          video.removeEventListener('error', handleError);
          resolve(true);
        };
        
        const handleError = () => {
          video.removeEventListener('loadeddata', handleLoadedData);
          video.removeEventListener('error', handleError);
          reject(new Error('Failed to load video'));
        };
        
        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('error', handleError);
        video.load();
      });
      
      videoLoadedRef.current = true;
      
      updateDebugInfo({
        videoState: 'ready',
        videoTime: 0,
        canvasReady: true
      });
      
      console.log('[FileStreaming] Video loaded successfully');
    } catch (error) {
      logError(`Failed to load video: ${error}`);
      throw error;
    }
  };
  
  const loadPDF = async (file: File) => {
    try {
      updateDebugInfo({ canvasReady: true });
    } catch (error) {
      logError(`Failed to load PDF: ${error}`);
      throw error;
    }
  };
  
  const loadImage = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      const maxWidth = 1920;
      const maxHeight = 1080;
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
    }
    
    URL.revokeObjectURL(url);
  };
  
  const loadGenericFile = async (file: File) => {
    if (file.type.startsWith('text/')) {
      const text = await file.text();
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        canvas.width = 1280;
        canvas.height = 720;
        
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'black';
          ctx.font = '16px monospace';
          
          const lines = text.split('\n').slice(0, 30);
          lines.forEach((line, index) => {
            ctx.fillText(line.substring(0, 100), 10, 30 + (index * 20));
          });
        }
      }
    } else {
      toast.warning('This file type cannot be directly streamed.');
    }
  };

  const startStreaming = useCallback(async (file: File) => {
    if (!webRTCManager) {
      toast.error('WebRTC Manager not initialized');
      return;
    }
    
    try {
      // 원본 스트림 상태 캡처
      streamStateManager.current.captureState(localStream);
      
      // 원본 트랙 상태 저장 (enabled 상태 포함)
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];
        
        originalTracksRef.current = {
          video: videoTrack || null,
          audio: audioTrack || null,
          videoEnabled: videoTrack?.enabled || false,
          audioEnabled: audioTrack?.enabled || false
        };
        
        console.log('[FileStreaming] Saved original track states:', {
          videoEnabled: originalTracksRef.current.videoEnabled,
          audioEnabled: originalTracksRef.current.audioEnabled
        });
      }
      
      let captureStream: MediaStream | null = null;
      
      if (fileType === 'video' && videoRef.current) {
        const video = videoRef.current;
        
        console.log('[FileStreaming] Waiting for video to be ready...');
        
        if (video.readyState < 3) {
          console.log('[FileStreaming] Video not ready, waiting... (readyState:', video.readyState, ')');
          
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Video load timeout'));
            }, 10000);
            
            const checkReady = () => {
              if (video.readyState >= 3) {
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve(true);
              }
            };
            
            video.addEventListener('canplay', () => {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              resolve(true);
            }, { once: true });
            
            const checkInterval = setInterval(checkReady, 100);
            checkReady();
          });
        }
        
        console.log('[FileStreaming] Video is ready (readyState:', video.readyState, ')');
        
        const fpsSettings = {
          low: 15,
          medium: 24,
          high: 30
        };
        const fps = fpsSettings[streamQuality];
        
        try {
          if ('captureStream' in video) {
            captureStream = (video as any).captureStream(fps);
            console.log('[FileStreaming] Using captureStream');
          } else if ('mozCaptureStream' in video) {
            captureStream = (video as any).mozCaptureStream(fps);
            console.log('[FileStreaming] Using mozCaptureStream');
          } else {
            console.warn('[FileStreaming] captureStream not supported, using canvas fallback');
            captureStream = await createCanvasStreamFromVideo(video, fps);
          }
        } catch (error) {
          console.error('[FileStreaming] Failed to create capture stream:', error);
          throw new Error(`Failed to capture video stream: ${error}`);
        }
        
        if (!captureStream) {
          throw new Error('Failed to create capture stream');
        }
        
        console.log(`[FileStreaming] Video capture stream created with ${fps} fps`);
        
        if (video.paused) {
          try {
            await video.play();
            setVideoState(prev => ({ ...prev, isPaused: false }));
            console.log('[FileStreaming] Video playback started');
          } catch (playError) {
            console.warn('[FileStreaming] Auto-play failed:', playError);
            toast.warning('Please click play to start streaming');
          }
        }
        
      } else if (canvasRef.current) {
        const fps = streamQuality === 'high' ? 30 : streamQuality === 'medium' ? 24 : 15;
        
        if ('captureStream' in canvasRef.current) {
          captureStream = (canvasRef.current as any).captureStream(fps);
        } else if ('mozCaptureStream' in canvasRef.current) {
          captureStream = (canvasRef.current as any).mozCaptureStream(fps);
        } else {
          throw new Error('Canvas captureStream is not supported in this browser');
        }
        
        console.log(`[FileStreaming] Canvas capture stream created with ${fps} fps`);
      }
      
      if (!captureStream) {
        throw new Error('Failed to create capture stream');
      }
      
      const tracks = captureStream.getTracks();
      if (tracks.length === 0) {
        throw new Error('Capture stream has no tracks');
      }
      
      fileStreamRef.current = captureStream;
      streamRef.current = captureStream;
      
      updateDebugInfo({
        streamCreated: true,
        trackCount: tracks.length,
        streamActive: tracks.some(t => t.readyState === 'live'),
        peersConnected: peers.size,
        audioEnabled: tracks.some(t => t.kind === 'audio')
      });
      
      console.log(`[FileStreaming] Stream has ${tracks.length} tracks:`,
        tracks.map(t => `${t.kind}:${t.readyState}`).join(', '));
      
      // 트랙 교체 및 강제 활성화
      await replaceStreamTracksWithForceEnable(captureStream);
      
      setIsStreaming(true);
      toast.success('Started file streaming');
      
    } catch (error) {
      logError(`Failed to start streaming: ${error}`);
      toast.error(`Streaming failed: ${error}`);
      
      if (!recoveryAttemptRef.current) {
        recoveryAttemptRef.current = true;
        
        setTimeout(() => {
          recoveryAttemptRef.current = false;
        }, 5000);
        
        if (fileType === 'video' && videoRef.current) {
          console.log('[FileStreaming] Attempting video reload...');
          videoRef.current.load();
          setTimeout(() => {
            startStreaming(file);
          }, 1000);
        }
      }
    }
  }, [fileType, streamQuality, webRTCManager, localStream, peers, setIsStreaming, updateDebugInfo, setVideoState, createCanvasStreamFromVideo]);

  // 트랙 교체 및 강제 활성화 함수
  const replaceStreamTracksWithForceEnable = async (newStream: MediaStream) => {
    if (!localStream || !webRTCManager) return;
    
    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];
    
    // 비디오 트랙 교체 및 강제 활성화
    if (newVideoTrack) {
      const originalVideoTrack = localStream.getVideoTracks()[0];
      
      if (originalVideoTrack) {
        webRTCManager.replaceTrack(originalVideoTrack, newVideoTrack, localStream);
        localStream.removeTrack(originalVideoTrack);
        localStream.addTrack(newVideoTrack);
      } else {
        localStream.addTrack(newVideoTrack);
        webRTCManager.addTrackToAllPeers(newVideoTrack, localStream);
      }
      
      // 스트리밍 트랙은 항상 활성화 (중요!)
      newVideoTrack.enabled = true;
      console.log('[FileStreaming] File streaming video track enabled');
    }
    
    // 오디오 트랙 교체 및 활성화
    if (newAudioTrack) {
      const originalAudioTrack = localStream.getAudioTracks()[0];
      
      if (originalAudioTrack) {
        webRTCManager.replaceTrack(originalAudioTrack, newAudioTrack, localStream);
        localStream.removeTrack(originalAudioTrack);
        localStream.addTrack(newAudioTrack);
      } else {
        localStream.addTrack(newAudioTrack);
        webRTCManager.addTrackToAllPeers(newAudioTrack, localStream);
      }
      
      newAudioTrack.enabled = true;
      console.log('[FileStreaming] File streaming audio track enabled');
    }
  };

  const stopStreaming = useCallback(async () => {
    console.log('[FileStreaming] Stopping stream...');
    
    try {
      // 비디오 일시정지
      if (videoRef.current && fileType === 'video') {
        videoRef.current.pause();
        setVideoState(prev => ({ ...prev, isPaused: true }));
      }
      
      // 파일 스트림 트랙 중지
      if (fileStreamRef.current) {
        fileStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`[FileStreaming] Stopped track: ${track.label}`);
        });
      }
      
      // 원본 스트림 상태로 복구
      await restoreOriginalStreamWithState();
      
      fileStreamRef.current = null;
      streamRef.current = null;
      setIsStreaming(false);
      updateDebugInfo({ 
        streamCreated: false, 
        streamActive: false, 
        trackCount: 0,
        audioEnabled: false
      });
      
      toast.info('Stopped file streaming');
      
    } catch (error) {
      logError(`Error during stop streaming: ${error}`);
      toast.error('Error stopping stream');
    }
  }, [fileType, setIsStreaming, updateDebugInfo, setVideoState]);

  // 원본 스트림 상태로 복구하는 함수
  const restoreOriginalStreamWithState = async () => {
    if (!localStream || !webRTCManager) return;
    
    const originalState = originalTracksRef.current;
    
    if (fileStreamRef.current && originalState) {
      const fileVideoTrack = fileStreamRef.current.getVideoTracks()[0];
      const fileAudioTrack = fileStreamRef.current.getAudioTracks()[0];
      
      // 비디오 트랙 복구
      if (originalState.video && fileVideoTrack) {
        webRTCManager.replaceTrack(fileVideoTrack, originalState.video, localStream);
        localStream.removeTrack(fileVideoTrack);
        localStream.addTrack(originalState.video);
        
        // 원래 enabled 상태로 복구 (중요!)
        originalState.video.enabled = originalState.videoEnabled;
        console.log(`[FileStreaming] Restored video track enabled state to: ${originalState.videoEnabled}`);
      } else if (fileVideoTrack) {
        localStream.removeTrack(fileVideoTrack);
        webRTCManager.removeTrackFromAllPeers(fileVideoTrack, localStream);
      }
      
      // 오디오 트랙 복구
      if (originalState.audio && fileAudioTrack) {
        webRTCManager.replaceTrack(fileAudioTrack, originalState.audio, localStream);
        localStream.removeTrack(fileAudioTrack);
        localStream.addTrack(originalState.audio);
        
        // 원래 enabled 상태로 복구
        originalState.audio.enabled = originalState.audioEnabled;
        console.log(`[FileStreaming] Restored audio track enabled state to: ${originalState.audioEnabled}`);
      } else if (fileAudioTrack) {
        localStream.removeTrack(fileAudioTrack);
        webRTCManager.removeTrackFromAllPeers(fileAudioTrack, localStream);
      }
    }
    
    // 더미 스트림 상태 유지
    const snapshot = streamStateManager.current.getSnapshot();
    if (snapshot?.streamType === 'none' || streamStateManager.current.isDummyStream()) {
      console.log('[FileStreaming] Maintaining dummy stream state');
    }
  };

  const cleanupResources = useCallback(() => {
    cleanupObjectUrl();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (fileStreamRef.current) {
      fileStreamRef.current.getTracks().forEach(track => track.stop());
      fileStreamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
    }
    
    videoLoadedRef.current = false;
    streamStateManager.current.reset();
    recoveryManager.current.reset();
    originalTracksRef.current = { video: null, audio: null, videoEnabled: false, audioEnabled: false };
  }, [cleanupObjectUrl]);
  
  return {
    debugInfo,
    videoState,
    handleFileSelect,
    startStreaming,
    stopStreaming,
    updateDebugInfo,
    cleanupResources
  };
};
