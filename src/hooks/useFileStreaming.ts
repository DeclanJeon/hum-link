/**
 * @fileoverview 파일 스트리밍 Hook - iOS 최적화 포함
 * @module hooks/useFileStreaming
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { StreamStateManager } from '@/services/streamStateManager';
import { VideoLoader } from '@/services/videoLoader';
import { RecoveryManager } from '@/services/recoveryManager';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { AdaptiveStreamManager } from '@/services/adaptiveStreamManager';
import { getDeviceInfo, isIOS } from '@/lib/deviceDetector';
import { getStrategyDescription } from '@/lib/streamingStrategy';

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
  isIOS: boolean;
  streamingStrategy: string;
  deviceInfo: string;
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
  const animationFrameRef = useRef<number | null>(null);
  const originalTracksRef = useRef<OriginalTrackState>({
    video: null,
    audio: null,
    videoEnabled: false,
    audioEnabled: false
  });
  
  // Managers - Lazy initialization으로 변경
  const streamStateManager = useRef(new StreamStateManager());
  const videoLoader = useRef(new VideoLoader());
  const recoveryManager = useRef(new RecoveryManager());
  const adaptiveStreamManager = useRef<AdaptiveStreamManager | null>(null);
  
  const recoveryAttemptRef = useRef<boolean>(false);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  
  // MediaDeviceStore
  const { 
    saveOriginalMediaState, 
    restoreOriginalMediaState, 
    setFileStreaming 
  } = useMediaDeviceStore();
  
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
    errors: [],
    isIOS: isIOS(),
    streamingStrategy: 'not initialized',
    deviceInfo: ''
  });
  
  /**
   * 디바이스 정보 초기화 - 한 번만 실행
   */
  useEffect(() => {
    const deviceInfo = getDeviceInfo();
    
    setDebugInfo(prev => ({
      ...prev,
      isIOS: deviceInfo.isIOS,
      deviceInfo: JSON.stringify(deviceInfo, null, 2)
    }));
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[FileStreaming] Device Info:', deviceInfo);
    }
    
    // iOS 감지 시 토스트는 실제 스트리밍 시작할 때만 표시
  }, []); // 빈 의존성 배열로 한 번만 실행
  
  // FPS 계산
  useEffect(() => {
    if (!isStreaming) return;
    
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
  }, [isStreaming]);
  
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
      console.log('[FileStreaming] Object URL cleaned up');
    }
  }, []);

  /**
   * AdaptiveStreamManager Lazy Initialization
   */
  const getAdaptiveStreamManager = useCallback(() => {
    if (!adaptiveStreamManager.current) {
      adaptiveStreamManager.current = new AdaptiveStreamManager();
      
      const strategyInfo = adaptiveStreamManager.current.getInfo();
      
      setDebugInfo(prev => ({
        ...prev,
        streamingStrategy: strategyInfo.strategy.strategy
      }));
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[FileStreaming] AdaptiveStreamManager initialized');
        console.log('[FileStreaming] Strategy:', getStrategyDescription(strategyInfo.strategy));
      }
      
      // iOS 최적화 토스트
      if (strategyInfo.device.isIOS) {
        toast.info('iOS device detected - Using optimized streaming', { duration: 3000 });
      }
    }
    
    return adaptiveStreamManager.current;
  }, []);

  /**
   * 파일 선택 핸들러
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
   * 비디오 로딩 (복구 포함)
   */
  const loadVideoWithRecovery = async (file: File) => {
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
      const url = URL.createObjectURL(file);
      currentObjectUrlRef.current = url;
      
      const video = videoRef.current;
      video.src = url;
      
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

  /**
   * 스트리밍 시작 (iOS 최적화)
   */
  const startStreaming = useCallback(async (file: File) => {
    if (!webRTCManager) {
      toast.error('WebRTC Manager not initialized');
      return;
    }
    
    try {
      console.log('[FileStreaming] Starting streaming with adaptive strategy...');
      
      // 1. 원본 상태 저장
      saveOriginalMediaState();
      
      // 2. 원본 트랙 저장
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];
        
        originalTracksRef.current = {
          video: videoTrack || null,
          audio: audioTrack || null,
          videoEnabled: videoTrack?.enabled || false,
          audioEnabled: audioTrack?.enabled || false
        };
        
        console.log('[FileStreaming] Saved original tracks:', {
          hasVideo: !!videoTrack,
          hasAudio: !!audioTrack,
          videoEnabled: videoTrack?.enabled,
          audioEnabled: audioTrack?.enabled
        });
      }
      
      // 3. StreamStateManager 저장
      const mediaDeviceState = useMediaDeviceStore.getState();
      streamStateManager.current.captureState(localStream, {
        isAudioEnabled: mediaDeviceState.isAudioEnabled,
        isVideoEnabled: mediaDeviceState.isVideoEnabled,
        isSharingScreen: mediaDeviceState.isSharingScreen
      });
      
      // 4. 파일 스트리밍 모드 활성화
      setFileStreaming(true);
      
      console.log('[FileStreaming] Original state saved, preparing adaptive stream...');
      
      // 5. 스트림 생성 - Lazy initialization
      const manager = getAdaptiveStreamManager();
      
      if (fileType === 'video' && videoRef.current) {
        const video = videoRef.current;
        
        // 비디오 준비 확인
        if (video.readyState < 3) {
          console.log('[FileStreaming] Waiting for video to be ready...');
          
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
        
        console.log('[FileStreaming] Video is ready, creating adaptive stream...');
        
        // AdaptiveStreamManager로 스트림 생성
        const result = await manager.createStream(
          video,
          // MediaRecorder 청크 콜백
          (blob, timestamp) => {
            // Blob을 ArrayBuffer로 변환하여 DataChannel로 전송
            blob.arrayBuffer().then(buffer => {
              const { sendToAllPeers } = webRTCManager;
              sendToAllPeers(buffer);
            });
          }
        );
        
        streamCleanupRef.current = result.cleanup;
        fileStreamRef.current = result.stream;
        streamRef.current = result.stream;
        
        console.log(`[FileStreaming] Stream created with strategy: ${result.strategy}`);
        console.log(`[FileStreaming] Config:`, result.config);
        
        updateDebugInfo({
          streamCreated: true,
          trackCount: result.stream.getTracks().length,
          streamActive: result.stream.getTracks().some(t => t.readyState === 'live'),
          peersConnected: peers.size,
          streamingStrategy: result.strategy,
          fps: result.config.fps
        });
        
        // 비디오 재생
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
        
        // WebRTC 트랙 교체 (MediaRecorder 제외)
        if (result.strategy !== 'mediarecorder') {
          await replaceStreamTracksForFileStreaming(result.stream);
        }
        
      } else if (canvasRef.current) {
        // Canvas 기반 (PDF, 이미지)
        const result = await manager.createStream(
          document.createElement('video') // 더미 엘리먼트
        );
        
        streamCleanupRef.current = result.cleanup;
        fileStreamRef.current = result.stream;
        streamRef.current = result.stream;
        
        await replaceStreamTracksForFileStreaming(result.stream);
      }
      
      setIsStreaming(true);
      
      // iOS 토스트
      if (isIOS()) {
        toast.success('File streaming started (iOS optimized)', { duration: 3000 });
      } else {
        toast.success('Started file streaming');
      }
      
    } catch (error) {
      logError(`Failed to start streaming: ${error}`);
      toast.error(`Streaming failed: ${error}`);
      
      // 실패 시 원본 상태 복원
      await restoreOriginalMediaState();
      setFileStreaming(false);
      
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
  }, [fileType, streamQuality, webRTCManager, localStream, peers, setIsStreaming, updateDebugInfo, setVideoState, saveOriginalMediaState, restoreOriginalMediaState, setFileStreaming, getAdaptiveStreamManager]);

  /**
   * 스트림 트랙 교체
   */
  const replaceStreamTracksForFileStreaming = async (newStream: MediaStream) => {
    if (!localStream || !webRTCManager) return;
    
    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];
    
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
      
      newVideoTrack.enabled = true;
      console.log('[FileStreaming] File streaming video track replaced and enabled');
    }
    
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
      console.log('[FileStreaming] File streaming audio track replaced and enabled');
    }
  };

  /**
   * 원본 트랙 복원
   */
  const restoreOriginalTracks = async () => {
    if (!localStream || !webRTCManager) {
      console.error('[FileStreaming] Cannot restore tracks: no stream or WebRTC manager');
      return false;
    }
    
    const originalState = originalTracksRef.current;
    
    if (!originalState.video && !originalState.audio) {
      console.warn('[FileStreaming] No original tracks to restore');
      return false;
    }
    
    console.log('[FileStreaming] Restoring original tracks...');
    
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      const currentAudioTrack = localStream.getAudioTracks()[0];
      
      if (originalState.video && currentVideoTrack) {
        console.log('[FileStreaming] Replacing file video track with original camera track');
        
        webRTCManager.replaceTrack(currentVideoTrack, originalState.video, localStream);
        localStream.removeTrack(currentVideoTrack);
        localStream.addTrack(originalState.video);
        originalState.video.enabled = originalState.videoEnabled;
        currentVideoTrack.stop();
        
        console.log(`[FileStreaming] Video track restored, enabled: ${originalState.videoEnabled}`);
      }
      
      if (originalState.audio && currentAudioTrack) {
        console.log('[FileStreaming] Replacing file audio track with original audio track');
        
        webRTCManager.replaceTrack(currentAudioTrack, originalState.audio, localStream);
        localStream.removeTrack(currentAudioTrack);
        localStream.addTrack(originalState.audio);
        originalState.audio.enabled = originalState.audioEnabled;
        currentAudioTrack.stop();
        
        console.log(`[FileStreaming] Audio track restored, enabled: ${originalState.audioEnabled}`);
      }
      
      return true;
    } catch (error) {
      console.error('[FileStreaming] Failed to restore original tracks:', error);
      return false;
    }
  };

  /**
   * 스트리밍 중지
   */
  const stopStreaming = useCallback(async () => {
    console.log('[FileStreaming] Stopping stream...');
    
    try {
      // 1. 비디오 정지
      if (videoRef.current && fileType === 'video') {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setVideoState(prev => ({ ...prev, isPaused: true, currentTime: 0 }));
      }
      
      // 2. 애니메이션 중지
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // 3. AdaptiveStreamManager 정리
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }
      
      if (adaptiveStreamManager.current) {
        adaptiveStreamManager.current.cleanup();
        // 인스턴스는 유지 (재사용 가능)
      }
      
      // 4. 원본 트랙 복원
      console.log('[FileStreaming] Restoring original camera/audio tracks...');
      const tracksRestored = await restoreOriginalTracks();
      
      if (!tracksRestored) {
        console.error('[FileStreaming] Failed to restore original tracks');
        toast.error('Failed to restore camera. Please refresh the page.');
      } else {
        console.log('[FileStreaming] Original tracks restored successfully');
      }
      
      // 5. 파일 스트림 정리
      if (fileStreamRef.current) {
        fileStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        fileStreamRef.current = null;
      }
      
      // 6. 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        streamRef.current = null;
      }
      
      // 7. MediaDeviceStore 복원
      console.log('[FileStreaming] Restoring MediaDeviceStore state...');
      const storeRestored = await restoreOriginalMediaState();
      
      if (!storeRestored) {
        console.error('[FileStreaming] Failed to restore MediaDeviceStore state');
      } else {
        console.log('[FileStreaming] MediaDeviceStore state restored successfully');
      }
      
      // 8. 파일 스트리밍 모드 해제
      setFileStreaming(false);
      setIsStreaming(false);
      
      // 9. 원본 트랙 참조 초기화
      originalTracksRef.current = {
        video: null,
        audio: null,
        videoEnabled: false,
        audioEnabled: false
      };
      
      updateDebugInfo({ 
        streamCreated: false, 
        streamActive: false, 
        trackCount: 0,
        audioEnabled: false
      });
      
      toast.info('Stopped file streaming and restored camera');
      
    } catch (error) {
      logError(`Error during stop streaming: ${error}`);
      toast.error('Error stopping stream. Please refresh the page.');
      
      setFileStreaming(false);
      setIsStreaming(false);
    }
  }, [fileType, setIsStreaming, updateDebugInfo, setVideoState, restoreOriginalMediaState, setFileStreaming, webRTCManager, localStream]);

  /**
   * 리소스 정리
   */
  const cleanupResources = useCallback(() => {
    console.log('[FileStreaming] Cleaning up resources...');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    cleanupObjectUrl();
    
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }
    
    if (adaptiveStreamManager.current) {
      adaptiveStreamManager.current.cleanup();
      adaptiveStreamManager.current = null; // 인스턴스도 제거
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`[FileStreaming] Cleanup: Stopped track ${track.label}`);
      });
      streamRef.current = null;
    }
    
    if (fileStreamRef.current) {
      fileStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`[FileStreaming] Cleanup: Stopped file stream track ${track.label}`);
      });
      fileStreamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
      console.log('[FileStreaming] Video element cleaned');
    }
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    videoLoadedRef.current = false;
    frameCountRef.current = 0;
    streamStateManager.current.reset();
    recoveryManager.current.reset();
    originalTracksRef.current = {
      video: null,
      audio: null,
      videoEnabled: false,
      audioEnabled: false
    };
    
    console.log('[FileStreaming] Resource cleanup completed');
  }, [cleanupObjectUrl, canvasRef, videoRef]);
  
  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStreaming();
      }
      cleanupResources();
    };
  }, []);
  
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
