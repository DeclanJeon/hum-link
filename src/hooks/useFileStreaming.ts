import { useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import * as pdfjs from 'pdfjs-dist';

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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
  const streamRef = useRef<MediaStream | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const videoLoadedRef = useRef<boolean>(false);

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

  const handleFileSelect = async (
    file: File, 
    setSelectedFile: (file: File) => void,
    setFileType: (type: string) => void
  ) => {
    try {
      // 스트리밍 중이면 중지
      if (isStreaming) {
        await stopStreaming();
      }
      
      // 이전 비디오 정리
      videoLoadedRef.current = false;
      cleanupObjectUrl();
      
      setSelectedFile(file);
      
      // 파일 타입별 처리
      if (file.type.startsWith('video/')) {
        setFileType('video');
        await loadVideo(file);
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
      toast.error('Failed to load file');
    }
  };

  const loadVideo = async (file: File) => {
    if (!videoRef.current) {
      logError('Video element not found');
      return;
    }

    const url = URL.createObjectURL(file);
    currentObjectUrlRef.current = url;

    return new Promise<void>((resolve, reject) => {
      const video = videoRef.current!;
      
      // 모든 이벤트 리스너 제거
      video.oncanplay = null;
      video.onloadedmetadata = null;
      video.onerror = null;
      
      // canplay 이벤트 사용 (WebRTC 예제 참고)
      video.oncanplay = () => {
        console.log('[FileStreaming] Video can play');
        videoLoadedRef.current = true;
        
        setVideoState(prev => ({
          ...prev,
          duration: video.duration,
          currentTime: 0
        }));
        
        updateDebugInfo({ 
          videoState: 'ready',
          videoTime: 0
        });
        
        resolve();
      };
      
      video.onerror = () => {
        const error = video.error;
        let errorMessage = 'Unknown video error';
        if (error) {
          errorMessage = `Error code: ${error.code}, message: ${error.message}`;
        }
        logError(`Video load error: ${errorMessage}`);
        cleanupObjectUrl();
        videoLoadedRef.current = false;
        reject(new Error(errorMessage));
      };
      
      // 비디오 설정 및 로드
      video.src = url;
      video.volume = videoState.volume / 100;
      video.muted = false;
      video.load();
      
      console.log(`[FileStreaming] Loading video from: ${url}`);
    });
  };

  const loadPDF = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      updateDebugInfo({ canvasReady: true });
    } catch (error) {
      logError(`Failed to load PDF: ${error}`);
      toast.error('Failed to load PDF file');
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
      // 원본 트랙 저장
      if (localStream) {
        const currentVideoTrack = localStream.getVideoTracks()[0];
        const currentAudioTrack = localStream.getAudioTracks()[0];
        
        if (currentVideoTrack) {
          originalVideoTrackRef.current = currentVideoTrack;
        }
        if (currentAudioTrack) {
          originalAudioTrackRef.current = currentAudioTrack;
        }
      }

      let captureStream: MediaStream | null = null;

      // 파일 타입별 스트림 생성
      if (fileType === 'video' && videoRef.current && videoLoadedRef.current) {
        // 비디오 직접 캡처 (WebRTC 예제 방식)
        const video = videoRef.current;
        
        // FPS 설정 (0은 자동)
        const fpsSettings = {
          low: 15,
          medium: 0,
          high: 0
        };
        const fps = fpsSettings[streamQuality];
        
        // captureStream 직접 사용
        if ((video as any).captureStream) {
          captureStream = (video as any).captureStream(fps);
        } else if ((video as any).mozCaptureStream) {
          captureStream = (video as any).mozCaptureStream(fps);
        } else {
          throw new Error('Video capture is not supported');
        }
        
        console.log(`[FileStreaming] Video capture stream created with ${fps || 'auto'} fps`);
        
        // 비디오 자동 재생
        if (video.paused) {
          await video.play();
          setVideoState(prev => ({ ...prev, isPaused: false }));
        }
        
      } else if (canvasRef.current) {
        // Canvas 캡처 (PDF, 이미지 등)
        const fps = streamQuality === 'high' ? 30 : streamQuality === 'medium' ? 24 : 15;
        captureStream = (canvasRef.current as any).captureStream(fps);
        console.log(`[FileStreaming] Canvas capture stream created with ${fps} fps`);
      }

      if (!captureStream) {
        throw new Error('Failed to create capture stream');
      }

      streamRef.current = captureStream;
      
      const tracks = captureStream.getTracks();
      updateDebugInfo({ 
        streamCreated: true, 
        trackCount: tracks.length,
        streamActive: tracks.some(t => t.readyState === 'live'),
        peersConnected: peers.size,
        audioEnabled: tracks.some(t => t.kind === 'audio')
      });

      console.log(`[FileStreaming] Stream has ${tracks.length} tracks:`, 
        tracks.map(t => `${t.kind}:${t.readyState}`).join(', '));

      // 트랙 교체
      const newVideoTrack = captureStream.getVideoTracks()[0];
      const newAudioTrack = captureStream.getAudioTracks()[0];
      
      if (newVideoTrack && originalVideoTrackRef.current && localStream) {
        console.log('[FileStreaming] Replacing video track');
        webRTCManager.replaceTrack(originalVideoTrackRef.current, newVideoTrack, localStream);
        localStream.removeTrack(originalVideoTrackRef.current);
        localStream.addTrack(newVideoTrack);
      }
      
      if (newAudioTrack && originalAudioTrackRef.current && localStream) {
        console.log('[FileStreaming] Replacing audio track');
        webRTCManager.replaceTrack(originalAudioTrackRef.current, newAudioTrack, localStream);
        localStream.removeTrack(originalAudioTrackRef.current);
        localStream.addTrack(newAudioTrack);
      } else if (newAudioTrack && localStream && !originalAudioTrackRef.current) {
        // 오디오 트랙이 없었던 경우 추가
        console.log('[FileStreaming] Adding new audio track');
        localStream.addTrack(newAudioTrack);
        
        // 모든 peer에 추가
        const connectedPeers = Array.from(peers.keys());
        connectedPeers.forEach(peerId => {
          try {
            const pc = (webRTCManager as any)?.peers?.get(peerId);
            if (pc && !pc.destroyed) {
              pc.addTrack(newAudioTrack, localStream);
            }
          } catch (error) {
            console.warn(`[FileStreaming] Failed to add audio track to peer ${peerId}:`, error);
          }
        });
      }
      
      setIsStreaming(true);
      toast.success('Started file streaming');
      
    } catch (error) {
      logError(`Failed to start streaming: ${error}`);
      toast.error('Failed to start streaming');
    }
  }, [fileType, streamQuality, webRTCManager, localStream, peers, setIsStreaming, updateDebugInfo]);

  const stopStreaming = useCallback(async () => {
    console.log('[FileStreaming] Stopping stream...');
    
    // 비디오 정지
    if (videoRef.current && fileType === 'video') {
      videoRef.current.pause();
      setVideoState(prev => ({ ...prev, isPaused: true }));
    }
    
    // 원본 트랙 복원
    if (localStream && streamRef.current && webRTCManager) {
      if (originalVideoTrackRef.current) {
        const fileStreamVideoTrack = streamRef.current.getVideoTracks()[0];
        if (fileStreamVideoTrack) {
          try {
            webRTCManager.replaceTrack(fileStreamVideoTrack, originalVideoTrackRef.current, localStream);
            localStream.removeTrack(fileStreamVideoTrack);
            localStream.addTrack(originalVideoTrackRef.current);
            console.log('[FileStreaming] Original video track restored');
          } catch (error) {
            logError(`Failed to restore video track: ${error}`);
          }
        }
      }
      
      if (originalAudioTrackRef.current) {
        const fileStreamAudioTrack = streamRef.current.getAudioTracks()[0];
        if (fileStreamAudioTrack) {
          try {
            webRTCManager.replaceTrack(fileStreamAudioTrack, originalAudioTrackRef.current, localStream);
            localStream.removeTrack(fileStreamAudioTrack);
            localStream.addTrack(originalAudioTrackRef.current);
            console.log('[FileStreaming] Original audio track restored');
          } catch (error) {
            logError(`Failed to restore audio track: ${error}`);
          }
        }
      } else {
        // 추가된 오디오 트랙 제거
        const fileStreamAudioTrack = streamRef.current.getAudioTracks()[0];
        if (fileStreamAudioTrack && localStream) {
          localStream.removeTrack(fileStreamAudioTrack);
          fileStreamAudioTrack.stop();
        }
      }
    }
    
    // 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`[FileStreaming] Stopped track: ${track.label}`);
      });
      streamRef.current = null;
    }
    
    originalVideoTrackRef.current = null;
    originalAudioTrackRef.current = null;
    
    setIsStreaming(false);
    updateDebugInfo({ 
      streamCreated: false, 
      streamActive: false, 
      trackCount: 0,
      audioEnabled: false
    });
    
    toast.info('Stopped file streaming');
  }, [fileType, localStream, webRTCManager, setIsStreaming, updateDebugInfo]);

  const cleanupResources = useCallback(() => {
    cleanupObjectUrl();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    videoLoadedRef.current = false;
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
