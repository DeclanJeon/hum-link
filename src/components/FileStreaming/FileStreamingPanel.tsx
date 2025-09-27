import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Maximize2, Minimize2, Camera, Bug } from 'lucide-react';
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

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStreaming();
      }
      cleanupResources();
      resetStreamingStore();
    };
  }, []);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  const returnToCamera = async () => {
    if (isStreaming) {
      await stopStreaming();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-6`}>
      <Card className={`${isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl max-h-[90vh]'} overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">File Streaming</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className={showDebug ? 'bg-secondary' : ''}
            >
              <Bug className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={returnToCamera}>
              <Camera className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Debug Panel */}
        {showDebug && <DebugPanel debugInfo={debugInfo} />}
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* File Selection */}
            <FileSelector 
              selectedFile={selectedFile}
              isStreaming={isStreaming}
              streamQuality={streamQuality}
              onFileSelect={(file) => handleFileSelect(file, setSelectedFile, setFileType)}
            />
            
            {/* Canvas for non-video files */}
            {fileType !== 'video' && (
              <div className="relative bg-black rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto max-h-[500px] object-contain mx-auto"
                  style={{ display: 'block' }}
                />
                {isStreaming && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    LIVE
                  </div>
                )}
              </div>
            )}
            
            {/* File Type Specific Controls */}
            {fileType === 'video' && selectedFile && (
              <VideoPlayer
                videoRef={videoRef}
                videoState={videoState}
                onStateChange={updateDebugInfo}
              />
            )}
            
            {fileType === 'pdf' && selectedFile && (
              <PDFViewer canvasRef={canvasRef} />
            )}
            
            {fileType === 'image' && selectedFile && (
              <ImageViewer canvasRef={canvasRef} />
            )}
            
            {/* Streaming Controls */}
            <StreamControls
              isStreaming={isStreaming}
              selectedFile={selectedFile}
              peers={peers}
              onStartStreaming={() => startStreaming(selectedFile!)}
              onStopStreaming={stopStreaming}
              onReturnToCamera={returnToCamera}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};