import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  FileVideo, FileText, FileImage, File, Play, Pause, StopCircle,
  ChevronLeft, ChevronRight, X, Maximize2, Minimize2,
  Volume2, VolumeX, RotateCw, Bug, AlertCircle, Camera,
  SkipForward, SkipBack, Eye, EyeOff, Mic, MicOff
} from 'lucide-react';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { toast } from 'sonner';
import * as pdfjs from 'pdfjs-dist';

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface FileStreamingPanelProps {
  isOpen: boolean;
  onClose: () => void;
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

export const FileStreamingPanel = ({ isOpen, onClose }: FileStreamingPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const frameDropCountRef = useRef(0);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoVolume, setVideoVolume] = useState([50]);
  const [videoMuted, setVideoMuted] = useState(false); // 오디오 전송을 위해 false로 변경
  const [videoPaused, setVideoPaused] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showVideoPreview, setShowVideoPreview] = useState(true);
  const [enableAudioStream, setEnableAudioStream] = useState(true); // 오디오 스트림 활성화
  const [showDebug, setShowDebug] = useState(false);
  const [currentFPS, setCurrentFPS] = useState(0);
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
  
  const { peers, webRTCManager } = usePeerConnectionStore();
  const { localStream } = useMediaDeviceStore();
  const {
    selectedFile,
    fileType,
    isStreaming,
    pdfDoc,
    currentPage,
    totalPages,
    streamQuality,
    setSelectedFile,
    setFileType,
    setIsStreaming,
    setPdfDoc,
    setCurrentPage,
    setTotalPages,
    setStreamQuality,
    reset: resetStreamingStore
  } = useFileStreamingStore();

  // 디버그 정보 업데이트
  const updateDebugInfo = useCallback((updates: Partial<DebugInfo>) => {
    setDebugInfo(prev => ({ ...prev, ...updates }));
  }, []);

  // 에러 로깅
  const logError = useCallback((error: string) => {
    console.error(`[FileStreaming] ${error}`);
    updateDebugInfo({ 
      errors: [...debugInfo.errors, `${new Date().toLocaleTimeString()}: ${error}`].slice(-5) 
    });
  }, [debugInfo.errors, updateDebugInfo]);

  // URL 정리 함수
  const cleanupObjectUrl = useCallback(() => {
    if (currentObjectUrlRef.current) {
      console.log(`[FileStreaming] Revoking object URL: ${currentObjectUrlRef.current}`);
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
  }, []);

  // 파일 선택 핸들러
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      // 기존 스트리밍 중지
      if (isStreaming) {
        await stopStreaming();
      }
      
      setSelectedFile(file);
      
      // 파일 타입 판별 및 로드
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

  // 비디오 로드 (개선된 버전)
  const loadVideo = async (file: File) => {
    cleanupObjectUrl();
    
    if (!videoRef.current) {
      logError('Video element not found');
      return;
    }

    console.log(`[FileStreaming] Loading video file: ${file.name}, size: ${file.size}, type: ${file.type}`);

    const url = URL.createObjectURL(file);
    currentObjectUrlRef.current = url;

    return new Promise<void>((resolve, reject) => {
      const video = videoRef.current!;
      
      const handleLoadedMetadata = () => {
        console.log(`[FileStreaming] Video metadata loaded`);
        console.log(`[FileStreaming] Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
        console.log(`[FileStreaming] Video duration: ${video.duration} seconds`);
        console.log(`[FileStreaming] Has audio: unknown (non-standard check)`);
        
        // Canvas 크기 설정 (성능 최적화)
        if (canvasRef.current) {
          let width = video.videoWidth;
          let height = video.videoHeight;
          
          // 품질에 따른 해상도 조정
          const maxDimensions = {
            low: { width: 640, height: 480 },
            medium: { width: 1280, height: 720 },
            high: { width: 1920, height: 1080 }
          };
          
          const max = maxDimensions[streamQuality];
          
          if (width > max.width || height > max.height) {
            const ratio = Math.min(max.width / width, max.height / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }
          
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          
          console.log(`[FileStreaming] Canvas size set to ${width}x${height} (quality: ${streamQuality})`);
          
          // 첫 프레임 그리기
          const ctx = canvasRef.current.getContext('2d', { 
            alpha: false,
            desynchronized: true // 성능 향상
          });
          if (ctx) {
            ctx.imageSmoothingEnabled = streamQuality === 'high';
            ctx.drawImage(video, 0, 0, width, height);
          }
        }
        
        setVideoDuration(video.duration);
        setVideoProgress(0);
        updateDebugInfo({ 
          videoState: 'loaded',
          videoTime: 0
        });
        
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('error', handleError);
        
        resolve();
      };
      
      const handleError = (e: Event) => {
        const video = e.target as HTMLVideoElement;
        const error = video.error;
        
        let errorMessage = 'Unknown video error';
        if (error) {
          const errorTypes: { [key: number]: string } = {
            1: 'MEDIA_ERR_ABORTED',
            2: 'MEDIA_ERR_NETWORK',
            3: 'MEDIA_ERR_DECODE',
            4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
          };
          errorMessage = errorTypes[error.code] || `Error code: ${error.code}`;
        }
        
        logError(`Video load error: ${errorMessage}`);
        cleanupObjectUrl();
        
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('error', handleError);
        
        reject(new Error(errorMessage));
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('error', handleError);
      
      video.src = url;
      video.muted = false; // 오디오 캡처를 위해 음소거 해제
      video.volume = videoVolume[0] / 100;
      video.preload = 'auto';
      video.load();
      
      console.log(`[FileStreaming] Started loading video from URL: ${url}`);
      updateDebugInfo({ videoState: 'loading' });
    });
  };

  // PDF 로드
  const loadPDF = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      await renderPDFPage(pdf, 1);
    } catch (error) {
      logError(`Failed to load PDF: ${error}`);
      toast.error('Failed to load PDF file');
    }
  };

  // PDF 페이지 렌더링
  const renderPDFPage = async (pdf: any, pageNum: number) => {
    if (!canvasRef.current) return;
    
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: streamQuality === 'high' ? 2.0 : 1.5 });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
    } catch (error) {
      logError(`Failed to render PDF page: ${error}`);
    }
  };

  // 이미지 로드
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

  // 일반 파일 로드
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
          
          const lines = text.split('\n').slice(0, 30); // 최대 30줄
          lines.forEach((line, index) => {
            ctx.fillText(line.substring(0, 100), 10, 30 + (index * 20)); // 줄당 최대 100자
          });
        }
      }
    } else {
      toast.warning('This file type cannot be directly streamed.');
    }
  };

  // 스트리밍 시작 (오디오 포함)
  const startStreaming = useCallback(async () => {
    console.log('[FileStreaming] Starting stream with audio...');
    updateDebugInfo({ errors: [] });

    if (!canvasRef.current) {
      const error = 'Canvas not ready';
      logError(error);
      toast.error(error);
      return;
    }

    if (!webRTCManager) {
      const error = 'WebRTC Manager not initialized';
      logError(error);
      toast.error(error);
      return;
    }

    try {
      // 현재 트랙 저장
      if (localStream) {
        const currentVideoTrack = localStream.getVideoTracks()[0];
        const currentAudioTrack = localStream.getAudioTracks()[0];
        
        if (currentVideoTrack) {
          originalVideoTrackRef.current = currentVideoTrack;
          console.log('[FileStreaming] Saved original video track:', currentVideoTrack.label);
        }
        if (currentAudioTrack) {
          originalAudioTrackRef.current = currentAudioTrack;
          console.log('[FileStreaming] Saved original audio track:', currentAudioTrack.label);
        }
      }

      // FPS 설정 (성능 최적화)
      const fpsSettings = {
        low: 15,
        medium: 24,
        high: 30
      };
      const fps = fpsSettings[streamQuality];
      
      console.log(`[FileStreaming] Creating capture stream with ${fps} FPS`);
      
      // Canvas capture stream 생성
      const canvasStream = canvasRef.current.captureStream(fps);
      
      // 오디오 스트림 생성 (비디오 파일인 경우)
      let combinedStream = canvasStream;
      
      if (fileType === 'video' && enableAudioStream && videoRef.current) {
        try {
          // 비디오 엘리먼트에서 오디오 캡처
          const audioContext = new AudioContext();
          const source = audioContext.createMediaElementSource(videoRef.current);
          const destination = audioContext.createMediaStreamDestination();
          
          // 오디오 연결
          source.connect(destination);
          source.connect(audioContext.destination); // 로컬 재생을 위해
          
          audioStreamRef.current = destination.stream;
          
          // 비디오와 오디오 트랙 결합
          combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
          ]);
          
          console.log('[FileStreaming] Audio stream created and combined');
          updateDebugInfo({ audioEnabled: true });
        } catch (audioError) {
          console.warn('[FileStreaming] Failed to capture audio:', audioError);
          toast.warning('Audio capture failed, streaming video only');
        }
      }
      
      streamRef.current = combinedStream;
      
      const tracks = combinedStream.getTracks();
      console.log(`[FileStreaming] Stream created with ${tracks.length} track(s)`);
      tracks.forEach(track => {
        console.log(`[FileStreaming] Track: ${track.kind} - ${track.label} - ${track.readyState}`);
      });

      updateDebugInfo({ 
        streamCreated: true, 
        trackCount: tracks.length,
        streamActive: tracks.some(t => t.readyState === 'live')
      });

      // 각 peer에게 트랙 교체
      const connectedPeers = Array.from(peers.keys());
      console.log(`[FileStreaming] Replacing tracks for ${connectedPeers.length} peer(s)`);
      updateDebugInfo({ peersConnected: connectedPeers.length });

      if (connectedPeers.length === 0) {
        toast.warning('No peers connected to stream to');
      }

      // 트랙 교체
      const newVideoTrack = combinedStream.getVideoTracks()[0];
      const newAudioTrack = combinedStream.getAudioTracks()[0];
      
      if (newVideoTrack && originalVideoTrackRef.current && localStream) {
        console.log('[FileStreaming] Replacing video track in peer connections');
        webRTCManager.replaceTrack(originalVideoTrackRef.current, newVideoTrack, localStream);
        localStream.removeTrack(originalVideoTrackRef.current);
        localStream.addTrack(newVideoTrack);
      }
      
      if (newAudioTrack && originalAudioTrackRef.current && localStream) {
        console.log('[FileStreaming] Replacing audio track in peer connections');
        webRTCManager.replaceTrack(originalAudioTrackRef.current, newAudioTrack, localStream);
        localStream.removeTrack(originalAudioTrackRef.current);
        localStream.addTrack(newAudioTrack);
      } else if (newAudioTrack && localStream) {
        // 오디오 트랙이 없었던 경우 추가
        console.log('[FileStreaming] Adding new audio track to stream');
        localStream.addTrack(newAudioTrack);
        
        // 각 peer에 오디오 트랙 추가
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
      toast.success('Started file streaming with audio');
      
      // 파일 타입별 캡처 시작
      if (fileType === 'video') {
        await startVideoCapture();
      } else if (fileType === 'pdf') {
        toast.info('Navigate PDF pages using the controls below');
      }
      
    } catch (error) {
      const errorMsg = `Failed to start streaming: ${error}`;
      logError(errorMsg);
      toast.error('Failed to start streaming - Check debug info');
      console.error('[FileStreaming] Full error:', error);
    }
  }, [fileType, streamQuality, webRTCManager, localStream, peers, setIsStreaming, logError, updateDebugInfo, enableAudioStream]);

  // 최적화된 비디오 캡처
  const startVideoCapture = async () => {
    console.log('[FileStreaming] Starting optimized video capture');
    
    if (!videoRef.current) {
      logError('Video element not found');
      return;
    }
    
    // 비디오 재생 시작
    if (videoRef.current.paused) {
      try {
        // 음소거 없이 재생 시도
        await videoRef.current.play();
        console.log('[FileStreaming] Video playback started with audio');
      } catch (error) {
        // 자동재생 정책으로 실패한 경우
        console.warn('[FileStreaming] Autoplay failed, trying with user interaction');
        toast.warning('Click play button to start video with audio');
        setVideoPaused(true);
        return;
      }
    }
    
    frameCountRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    frameDropCountRef.current = 0;
    
    // 최적화된 프레임 캡처
    const targetFPS = streamQuality === 'high' ? 30 : streamQuality === 'medium' ? 24 : 15;
    const frameInterval = 1000 / targetFPS;
    let lastFrameTime = 0;
    
    const captureFrame = (currentTime: number) => {
      if (!isStreaming || !videoRef.current || !canvasRef.current) {
        console.log('[FileStreaming] Stopping frame capture');
        return;
      }
      
      // FPS 제한
      const deltaTime = currentTime - lastFrameTime;
      
      if (deltaTime >= frameInterval) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { 
          alpha: false,
          desynchronized: true
        });
        const video = videoRef.current;
        
        if (ctx && video.readyState >= video.HAVE_CURRENT_DATA) {
          // 성능 최적화: 이미지 스무딩 설정
          ctx.imageSmoothingEnabled = streamQuality === 'high';
          ctx.imageSmoothingQuality = streamQuality === 'high' ? 'high' : 'low';
          
          // 비디오 프레임 그리기
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // FPS 카운터
          frameCountRef.current++;
          const now = performance.now();
          if (now - lastFrameTimeRef.current >= 1000) {
            setCurrentFPS(frameCountRef.current);
            updateDebugInfo({ 
              fps: frameCountRef.current,
              frameDrops: frameDropCountRef.current
            });
            frameCountRef.current = 0;
            lastFrameTimeRef.current = now;
          }
          
          // 오버레이 (옵션)
          if (showDebug && video.duration) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = 'bold 14px monospace';
            const info = `FPS: ${currentFPS} | Time: ${formatTime(video.currentTime)}/${formatTime(video.duration)}`;
            ctx.fillText(info, 10, canvas.height - 10);
          }
        } else {
          frameDropCountRef.current++;
        }
        
        lastFrameTime = currentTime;
      }
      
      animationFrameRef.current = requestAnimationFrame(captureFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(captureFrame);
  };

  // 스트리밍 중지 및 원래 트랙 복구
  const stopStreaming = useCallback(async () => {
    console.log('[FileStreaming] Stopping stream...');
    
    // 애니메이션 프레임 중지
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    
    // 비디오 일시정지
    if (videoRef.current && fileType === 'video') {
      videoRef.current.pause();
      console.log('[FileStreaming] Video paused');
    }
    
    // 원래 트랙으로 복귀
    if (localStream && streamRef.current && webRTCManager) {
      // 비디오 트랙 복구
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
      
      // 오디오 트랙 복구
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
        // 오디오 트랙이 없었던 경우 제거
        const fileStreamAudioTrack = streamRef.current.getAudioTracks()[0];
        if (fileStreamAudioTrack) {
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
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
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
  }, [fileType, localStream, webRTCManager, setIsStreaming, updateDebugInfo, logError]);

  // 비디오 컨트롤
  const toggleVideoPlayPause = async () => {
    if (!videoRef.current) return;
    
    try {
      if (videoPaused) {
        await videoRef.current.play();
        console.log('[FileStreaming] Video resumed');
      } else {
        videoRef.current.pause();
        console.log('[FileStreaming] Video paused');
      }
    } catch (error) {
      logError(`Failed to toggle video playback: ${error}`);
      toast.error('Playback failed - try clicking the play button');
    }
  };

  const handleVolumeChange = (value: number[]) => {
    setVideoVolume(value);
    if (videoRef.current) {
      videoRef.current.volume = value[0] / 100;
    }
  };

  const toggleMute = () => {
    const newMuted = !videoMuted;
    setVideoMuted(newMuted);
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  };

  const handleVideoSeek = (value: number[]) => {
    if (videoRef.current && videoDuration) {
      const seekTime = (value[0] / 100) * videoDuration;
      videoRef.current.currentTime = seekTime;
      setVideoProgress(value[0]);
    }
  };

  const skipVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + seconds));
    }
  };

  // PDF 네비게이션
  const navigatePDFPage = async (direction: 'next' | 'prev') => {
    if (!pdfDoc) return;
    
    let newPage = currentPage;
    if (direction === 'next' && currentPage < totalPages) {
      newPage = currentPage + 1;
    } else if (direction === 'prev' && currentPage > 1) {
      newPage = currentPage - 1;
    }
    
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
      await renderPDFPage(pdfDoc, newPage);
      toast.info(`Page ${newPage} of ${totalPages}`);
    }
  };

  // 이미지 회전
  const rotateImage = () => {
    if (fileType !== 'image' || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx?.drawImage(canvas, 0, 0);
    
    const temp = canvas.width;
    canvas.width = canvas.height;
    canvas.height = temp;
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2);
    ctx.restore();
    
    toast.info('Image rotated');
  };

  // 풀스크린 토글
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // 원래 카메라로 돌아가기 버튼
  const returnToCamera = async () => {
    if (isStreaming) {
      await stopStreaming();
    }
    onClose();
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStreaming();
      }
      cleanupObjectUrl();
      resetStreamingStore();
    };
  }, []);

  // 비디오 시간 업데이트 핸들러
  useEffect(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    
    const handleTimeUpdate = () => {
      if (video.duration) {
        setVideoProgress((video.currentTime / video.duration) * 100);
        updateDebugInfo({ 
          videoTime: video.currentTime,
          videoState: video.paused ? 'paused' : 'playing'
        });
      }
    };
    
    const handlePlay = () => {
      setVideoPaused(false);
      updateDebugInfo({ videoState: 'playing' });
    };
    
    const handlePause = () => {
      setVideoPaused(true);
      updateDebugInfo({ videoState: 'paused' });
    };
    
    const handleEnded = () => {
      setVideoPaused(true);
      updateDebugInfo({ videoState: 'ended' });
      toast.info('Video playback ended');
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [updateDebugInfo]);

  // Canvas 상태 모니터링
  useEffect(() => {
    if (canvasRef.current) {
      updateDebugInfo({ canvasReady: true });
    }
  }, [canvasRef.current]);

  if (!isOpen) return null;

  return (
    <div className={`fixed ${isFullscreen ? 'inset-0' : 'inset-0'} bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-6`}>
      <Card className={`${isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl max-h-[90vh]'} overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {fileType === 'video' && <FileVideo className="w-5 h-5" />}
            {fileType === 'pdf' && <FileText className="w-5 h-5" />}
            {fileType === 'image' && <FileImage className="w-5 h-5" />}
            {fileType === 'other' && <File className="w-5 h-5" />}
            File Streaming
          </h2>
          <div className="flex items-center gap-2">
            {fileType === 'video' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEnableAudioStream(!enableAudioStream)}
                  className={enableAudioStream ? 'bg-secondary' : ''}
                  title={enableAudioStream ? 'Audio enabled' : 'Audio disabled'}
                >
                  {enableAudioStream ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVideoPreview(!showVideoPreview)}
                  title={showVideoPreview ? 'Hide video preview' : 'Show video preview'}
                >
                  {showVideoPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className={showDebug ? 'bg-secondary' : ''}
            >
              <Bug className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={returnToCamera}
            >
              <Camera className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Debug Panel */}
        {showDebug && (
          <Alert className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1 text-xs font-mono">
                <div>Canvas Ready: {debugInfo.canvasReady ? '✅' : '❌'}</div>
                <div>Stream Created: {debugInfo.streamCreated ? '✅' : '❌'}</div>
                <div>Stream Active: {debugInfo.streamActive ? '✅' : '❌'}</div>
                <div>Track Count: {debugInfo.trackCount}</div>
                <div>Audio Enabled: {debugInfo.audioEnabled ? '✅' : '❌'}</div>
                <div>Peers Connected: {debugInfo.peersConnected}</div>
                <div>Video State: {debugInfo.videoState}</div>
                <div>Current FPS: {debugInfo.fps}</div>
                <div>Frame Drops: {debugInfo.frameDrops}</div>
                <div>Video Time: {debugInfo.videoTime.toFixed(2)}s</div>
                {debugInfo.errors.length > 0 && (
                  <div className="mt-2">
                    <div className="font-bold">Recent Errors:</div>
                    {debugInfo.errors.map((err, i) => (
                      <div key={i} className="text-red-500">{err}</div>
                    ))}
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* File Selection */}
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="video/*,application/pdf,image/*,text/*"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                disabled={isStreaming}
              >
                Select File
              </Button>
              
              {selectedFile && (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              )}
              
              {/* Quality Selector */}
              <div className="flex items-center gap-2">
                <Label className="text-sm">Quality:</Label>
                <select
                  value={streamQuality}
                  onChange={(e) => setStreamQuality(e.target.value as any)}
                  className="px-2 py-1 text-sm border rounded"
                  disabled={isStreaming}
                >
                  <option value="low">Low (15fps)</option>
                  <option value="medium">Medium (24fps)</option>
                  <option value="high">High (30fps)</option>
                </select>
              </div>
            </div>
            
            {/* Canvas Container */}
            <div className="relative bg-black rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full h-auto max-h-[500px] object-contain mx-auto"
                style={{ display: 'block' }}
              />
              
              {/* Streaming indicator */}
              {isStreaming && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
              )}
            </div>
            
            {/* Video Preview (로컬 재생) */}
            {fileType === 'video' && showVideoPreview && (
              <div className="bg-secondary rounded-lg p-2">
                <div className="text-xs text-muted-foreground mb-1">Local Preview:</div>
                <video
                  ref={videoRef}
                  className="w-full h-auto max-h-[200px] rounded"
                  controls={false} // 커스텀 컨트롤 사용
                  playsInline
                  muted={videoMuted}
                />
              </div>
            )}
            
            {/* Hidden video for non-preview mode */}
            {fileType === 'video' && !showVideoPreview && (
              <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted={videoMuted}
              />
            )}
            
            {/* File Type Specific Controls */}
            {fileType === 'video' && selectedFile && (
              <div className="space-y-3 p-4 bg-secondary/50 rounded-lg">
                {/* Playback controls */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => skipVideo(-10)}
                    size="sm"
                    variant="outline"
                    title="Skip back 10 seconds"
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    onClick={toggleVideoPlayPause}
                    size="sm"
                    variant="default"
                  >
                    {videoPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </Button>
                  
                  <Button
                    onClick={() => skipVideo(10)}
                    size="sm"
                    variant="outline"
                    title="Skip forward 10 seconds"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  
                  <div className="flex-1 px-4">
                    <Slider
                      value={[videoProgress]}
                      onValueChange={handleVideoSeek}
                      max={100}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatTime(videoRef.current?.currentTime || 0)}</span>
                      <span>{formatTime(videoDuration)}</span>
                    </div>
                  </div>
                </div>
                
                {/* Volume controls */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={toggleMute}
                    size="sm"
                    variant="ghost"
                  >
                    {videoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <Slider
                    value={videoVolume}
                    onValueChange={handleVolumeChange}
                    max={100}
                    step={1}
                    className="w-32"
                    disabled={videoMuted}
                  />
                  <span className="text-xs w-10">{videoVolume[0]}%</span>
                </div>
              </div>
            )}
            
            {fileType === 'pdf' && pdfDoc && (
              <div className="flex items-center justify-center gap-4">
                <Button
                  onClick={() => navigatePDFPage('prev')}
                  disabled={currentPage === 1}
                  size="sm"
                  variant="outline"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={currentPage}
                    onChange={(e) => {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= totalPages) {
                        setCurrentPage(page);
                        renderPDFPage(pdfDoc, page);
                      }
                    }}
                    className="w-16 px-2 py-1 text-center border rounded"
                    min={1}
                    max={totalPages}
                  />
                  <span className="text-sm">of {totalPages}</span>
                </div>
                
                <Button
                  onClick={() => navigatePDFPage('next')}
                  disabled={currentPage === totalPages}
                  size="sm"
                  variant="outline"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            
            {fileType === 'image' && selectedFile && (
              <div className="flex items-center justify-center">
                <Button
                  onClick={rotateImage}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RotateCw className="w-4 h-4" />
                  Rotate 90°
                </Button>
              </div>
            )}
            
            {/* Streaming Controls */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex gap-2">
                {!isStreaming ? (
                  <Button
                    onClick={startStreaming}
                    disabled={!selectedFile}
                    className="flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start Streaming
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={stopStreaming}
                      variant="destructive"
                      className="flex items-center gap-2"
                    >
                      <StopCircle className="w-4 h-4" />
                      Stop Streaming
                    </Button>
                    <Button
                      onClick={returnToCamera}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Return to Camera
                    </Button>
                  </>
                )}
              </div>
              
              {/* Status */}
              <div className="flex items-center gap-4 text-sm">
                {isStreaming && (
                  <span className="text-green-500 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Streaming to {peers.size} peer(s)
                  </span>
                )}
                {streamQuality && (
                  <span className="text-muted-foreground">
                    Quality: {streamQuality}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

// 시간 포맷 헬퍼 함수
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}