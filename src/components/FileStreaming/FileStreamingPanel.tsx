/**
 * @fileoverview 파일 스트리밍 패널 - 최소화 시 재생 유지
 * @module components/FileStreaming/FileStreamingPanel
 */

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Maximize2, Minimize2, Camera, Bug, AlertCircle, Minus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { toast } from 'sonner';
import { VideoPlayer } from './VideoPlayer';
import { PDFViewer } from './PDFViewer';
import { ImageViewer } from './ImageViewer';
import { FileSelector } from './FileSelector';
import { DebugPanel } from './DebugPanel';
import { StreamControls } from './StreamControls';
import { MiniPlayer } from './MiniPlayer';
import { useFileStreaming } from '@/hooks/useFileStreaming';
import { cn } from '@/lib/utils';
import { getDeviceInfo } from '@/lib/deviceDetector';
import { getStrategyDescription } from '@/lib/streamingStrategy';

interface FileStreamingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileStreamingPanel = ({ isOpen, onClose }: FileStreamingPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenVideoContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isReturningToCamera, setIsReturningToCamera] = useState(false);
  // 디바이스 정보 표시
  const [deviceInfo, setDeviceInfo] = useState<string>('');

  
  const { peers, webRTCManager } = usePeerConnectionStore();
  const { localStream } = useMediaDeviceStore();
  const {
    selectedFile,
    fileType,
    isStreaming,
    streamQuality,
    isMinimized,
    setSelectedFile,
    setFileType,
    setIsStreaming,
    setMinimized,
    toggleMinimized,
    reset: resetStreamingStore
  } = useFileStreamingStore();
  
  const {
    debugInfo,
    videoState,
    handleFileSelect,
    startStreaming,
    stopStreaming,
    updateDebugInfo,
    cleanupResources
  } = useFileStreaming({
    canvasRef,
    videoRef,
    webRTCManager,
    localStream,
    peers,
    isStreaming,
    setIsStreaming,
    streamQuality,
    fileType
  });

  useEffect(() => {
    const info = getDeviceInfo();
    if (info.isIOS) {
      setDeviceInfo(`iOS ${info.iosVersion || 'Unknown'} - ${info.optimalMimeType}`);
    } else {
      setDeviceInfo('Desktop/Android');
    }
  }, []);
  
  useEffect(() => {
    return () => {
      const cleanup = async () => {
        if (isStreaming) {
          await stopStreaming();
        }
        cleanupResources();
        resetStreamingStore();
      };
      cleanup();
    };
  }, []);
  
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      // ESC 키로 패널 닫기 (스트리밍 중이 아닐 때만)
      if (e.key === 'Escape' && !isStreaming && !isMinimized) {
        onClose();
      }
      
      // M 키로 최소화/최대화 토글
      if (e.key === 'm' || e.key === 'M') {
        if (isStreaming) {
          e.preventDefault();
          toggleMinimized();
        }
      }
      
      // 스페이스바로 비디오 재생/일시정지 (최소화 상태가 아닐 때만)
      if (e.key === ' ' && fileType === 'video' && videoRef.current && !isMinimized) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, isStreaming, fileType, onClose, isMinimized, toggleMinimized]);
  
  // 최소화 시 비디오 재생 상태 유지
  useEffect(() => {
    if (fileType === 'video' && videoRef.current && isStreaming) {
      if (isMinimized) {
        // 최소화 시에도 비디오는 계속 재생
        console.log('[FileStreamingPanel] Minimized but keeping video playing');
        // 비디오가 일시정지 상태라면 재생 시도
        if (videoRef.current.paused && !videoState.isPaused) {
          videoRef.current.play().catch(e => {
            console.warn('[FileStreamingPanel] Failed to continue playing on minimize:', e);
          });
        }
      }
    }
  }, [isMinimized, fileType, isStreaming, videoState.isPaused]);
  
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  
  const handleMinimize = () => {
    if (!isStreaming) {
      toast.warning('Start streaming first to minimize');
      return;
    }
    setMinimized(true);
    
    // 비디오인 경우 재생 상태 확인
    if (fileType === 'video' && videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(e => {
        console.warn('[FileStreamingPanel] Failed to play on minimize:', e);
      });
    }
  };
  
  const handleMaximize = () => {
    setMinimized(false);
  };
  
  const returnToCamera = async () => {
    setIsReturningToCamera(true);
    
    try {
      if (isStreaming) {
        await stopStreaming();
      }
      
      // 최소화 상태도 해제
      setMinimized(false);
      
      setTimeout(() => {
        onClose();
        setIsReturningToCamera(false);
      }, 500);
    } catch (error) {
      console.error('Error returning to camera:', error);
      toast.error('Failed to return to camera');
      setIsReturningToCamera(false);
    }
  };
  
  const handleStop = async () => {
    await stopStreaming();
    setMinimized(false);
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* 미니 플레이어 */}
      {isMinimized && (
        <MiniPlayer
          onMaximize={handleMaximize}
          onStop={handleStop}
          onReturnToCamera={returnToCamera}
        />
      )}
      
      {/* 비디오 엘리먼트 컨테이너 (항상 렌더링, 최소화 시 숨김) */}
      {fileType === 'video' && selectedFile && (
        <div 
          ref={hiddenVideoContainerRef}
          className={cn(
            "fixed",
            isMinimized ? "invisible pointer-events-none" : "hidden"
          )}
          style={{ 
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden'
          }}
        >
          <video
            ref={videoRef}
            className="w-full h-auto"
            controls={false}
            playsInline
            muted={videoState.isMuted}
          />
        </div>
      )}
      
      {/* 메인 패널 (최소화 시 숨김) */}
      <div 
        className={cn(
          "fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-6",
          isMinimized && "hidden"
        )}
      >
        <Card className={`${isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl max-h-[90vh]'} overflow-hidden flex flex-col`}>
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-bold">File Streaming</h2>
            <div className="flex items-center gap-2">
              {/* 디버그 토글 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
                className={showDebug ? 'bg-secondary' : ''}
                title="Toggle debug panel (D)"
              >
                <Bug className="w-4 h-4" />
              </Button>
              
              {/* 최소화 버튼 - 스트리밍 중일 때만 활성화 */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleMinimize}
                disabled={!isStreaming}
                title={isStreaming ? "Minimize (M)" : "Start streaming to minimize"}
              >
                <Minus className="w-4 h-4" />
              </Button>
              
              {/* 전체화면 토글 */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen (F11)' : 'Enter fullscreen (F11)'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              
              {/* 카메라로 돌아가기 */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={returnToCamera}
                disabled={isReturningToCamera}
                title="Return to camera"
              >
                <Camera className="w-4 h-4" />
              </Button>
              
              {/* 닫기 버튼 - 스트리밍 중일 때는 비활성화 */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClose}
                disabled={isStreaming}
                title={isStreaming ? "Stop streaming first" : "Close panel (ESC)"}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* 스트리밍 중 경고 */}
          {isStreaming && (
            <Alert className="m-4 mb-0">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>File is currently being streamed. You can minimize this panel to continue working.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMinimize}
                  className="ml-4"
                >
                  Minimize
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* iOS 정보 표시 */}
          {deviceInfo.includes('iOS') && (
            <Alert className="m-4 mb-0 bg-blue-50 dark:bg-blue-950 border-blue-200">
              <AlertDescription className="flex items-center gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  📱 {deviceInfo}
                </span>
                <span className="text-xs text-muted-foreground">
                  - Optimized for iOS Safari
                </span>
              </AlertDescription>
            </Alert>
          )}
          
          {/* 디버그 패널 */}
          {showDebug && <DebugPanel debugInfo={debugInfo} />}
          
          {/* 메인 콘텐츠 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* 파일 선택기 */}
              <FileSelector 
                selectedFile={selectedFile}
                isStreaming={isStreaming}
                streamQuality={streamQuality}
                onFileSelect={(file) => handleFileSelect(file, setSelectedFile, setFileType)}
              />
              
              {/* Canvas for PDF/Image */}
              {fileType !== 'video' && (
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto max-h-[500px] object-contain mx-auto"
                    style={{ display: 'block' }}
                  />
                  {isStreaming && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      LIVE
                    </div>
                  )}
                </div>
              )}
              
              {/* 비디오 플레이어 UI (비디오 엘리먼트는 위에서 별도 관리) */}
              {fileType === 'video' && selectedFile && (
                <VideoPlayer
                  videoRef={videoRef}
                  videoState={videoState}
                  onStateChange={updateDebugInfo}
                  isStreaming={isStreaming}
                  file={selectedFile}
                />
              )}
              
              {/* PDF 뷰어 */}
              {fileType === 'pdf' && selectedFile && (
                <PDFViewer 
                  canvasRef={canvasRef}
                  file={selectedFile}
                  isStreaming={isStreaming}
                />
              )}
              
              {/* 이미지 뷰어 */}
              {fileType === 'image' && selectedFile && (
                <ImageViewer 
                  canvasRef={canvasRef}
                  isStreaming={isStreaming}
                />
              )}
              
              {/* 스트림 컨트롤 */}
              <StreamControls
                isStreaming={isStreaming}
                selectedFile={selectedFile}
                peers={peers}
                onStartStreaming={() => startStreaming(selectedFile!)}
                onStopStreaming={stopStreaming}
                onReturnToCamera={returnToCamera}
                isReturningToCamera={isReturningToCamera}
              />
            </div>
          </div>
          
          {/* 키보드 단축키 안내 */}
          <div className="px-4 pb-2 text-xs text-muted-foreground">
            <span className="mr-4">ESC: Close</span>
            <span className="mr-4">M: Minimize</span>
            <span className="mr-4">D: Debug</span>
            {fileType === 'video' && <span>Space: Play/Pause</span>}
          </div>
        </Card>
      </div>
    </>
  );
};
