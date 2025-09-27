/**
 * @fileoverview 파일 스트리밍 패널 컴포넌트 수정
 * @module components/FileStreaming/FileStreamingPanel
 */

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Maximize2, Minimize2, Camera, Bug, AlertCircle } from 'lucide-react';
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
import { useFileStreaming } from '@/hooks/useFileStreaming';

interface FileStreamingPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileStreamingPanel = ({ isOpen, onClose }: FileStreamingPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isReturningToCamera, setIsReturningToCamera] = useState(false);
  
  const { peers, webRTCManager } = usePeerConnectionStore();
  const { localStream } = useMediaDeviceStore();
  const {
    selectedFile,
    fileType,
    isStreaming,
    streamQuality,
    setSelectedFile,
    setFileType,
    setIsStreaming,
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
      if (e.key === 'Escape' && !isStreaming) {
        onClose();
      }
      
      if (e.key === ' ' && fileType === 'video' && videoRef.current) {
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
  }, [isOpen, isStreaming, fileType, onClose]);
  
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  
  const returnToCamera = async () => {
    setIsReturningToCamera(true);
    
    try {
      if (isStreaming) {
        await stopStreaming();
      }
      
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
  
  if (!isOpen) return null;
  
  return (
    <div className={`fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-6`}>
      <Card className={`${isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl max-h-[90vh]'} overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">File Streaming</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className={showDebug ? 'bg-secondary' : ''}
              title="Toggle debug panel"
            >
              <Bug className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={returnToCamera}
              disabled={isReturningToCamera}
              title="Return to camera"
            >
              <Camera className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              disabled={isStreaming}
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {isStreaming && (
          <Alert className="m-4 mb-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              File is currently being streamed. Stop streaming before closing this panel.
            </AlertDescription>
          </Alert>
        )}
        
        {showDebug && <DebugPanel debugInfo={debugInfo} />}
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <FileSelector 
              selectedFile={selectedFile}
              isStreaming={isStreaming}
              streamQuality={streamQuality}
              onFileSelect={(file) => handleFileSelect(file, setSelectedFile, setFileType)}
            />
            
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
            
            {fileType === 'video' && selectedFile && (
              <VideoPlayer
                videoRef={videoRef}
                videoState={videoState}
                onStateChange={updateDebugInfo}
                isStreaming={isStreaming}
                file={selectedFile}
              />
            )}
            
            {fileType === 'pdf' && selectedFile && (
              <PDFViewer 
                canvasRef={canvasRef}
                file={selectedFile}
                isStreaming={isStreaming}
              />
            )}
            
            {fileType === 'image' && selectedFile && (
              <ImageViewer 
                canvasRef={canvasRef}
                isStreaming={isStreaming}
              />
            )}
            
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
      </Card>
    </div>
  );
};
