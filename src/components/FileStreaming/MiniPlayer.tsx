import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Maximize2, 
  X, 
  StopCircle, 
  FileVideo, 
  FileText, 
  FileImage,
  Move,
  Camera,
  Play,
  Pause
} from 'lucide-react';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MiniPlayerProps {
  onMaximize: () => void;
  onStop: () => void;
  onReturnToCamera: () => void;
}

export const MiniPlayer = ({ onMaximize, onStop, onReturnToCamera }: MiniPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isPlaying, setIsPlaying] = useState(true); // 재생 상태 추적
  
  const { 
    selectedFile, 
    fileType, 
    isStreaming,
    currentPage,
    totalPages,
    fps,
    setLastPosition 
  } = useFileStreamingStore();
  
  const peers = usePeerConnectionStore(state => state.peers);
  const connectedPeers = Array.from(peers.values()).filter(
    peer => peer?.connectionState === 'connected'
  ).length;
  
  // 비디오 재생 상태 모니터링
  useEffect(() => {
    if (fileType === 'video') {
      const checkVideoState = setInterval(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          setIsPlaying(!video.paused);
        }
      }, 500);
      
      return () => clearInterval(checkVideoState);
    }
  }, [fileType]);
  
  // 파일 타입에 따른 아이콘
  const getFileIcon = () => {
    switch (fileType) {
      case 'video':
        return <FileVideo className="w-4 h-4" />;
      case 'pdf':
        return <FileText className="w-4 h-4" />;
      case 'image':
        return <FileImage className="w-4 h-4" />;
      default:
        return <FileVideo className="w-4 h-4" />;
    }
  };
  
  // 파일명 축약
  const getShortFileName = (name: string | undefined) => {
    if (!name) return 'Unknown';
    if (name.length > 20) {
      return name.substring(0, 17) + '...';
    }
    return name;
  };
  
  // 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 320);
      const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 120);
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };
    
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // 위치 저장
        setLastPosition(position);
      }
    };
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, position, setLastPosition]);
  
  // 터치 이벤트 핸들러 (모바일)
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({
        x: touch.clientX - position.x,
        y: touch.clientY - position.y
      });
    }
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    
    const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 320);
    const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 120);
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  };
  
  const handleTouchEnd = () => {
    setIsDragging(false);
    setLastPosition(position);
  };
  
  if (!isStreaming) return null;
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed z-50 transition-all duration-200",
        isDragging && "cursor-grabbing opacity-90"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transition: isDragging ? 'none' : 'opacity 0.2s'
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Card className="w-80 bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2 flex-1">
            {/* 드래그 핸들 */}
            <div className="drag-handle cursor-grab hover:cursor-grabbing p-1">
              <Move className="w-4 h-4 text-muted-foreground" />
            </div>
            
            {/* 파일 정보 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getFileIcon()}
              <span className="text-sm font-medium truncate">
                {getShortFileName(selectedFile?.name)}
              </span>
            </div>
          </div>
          
          {/* 컨트롤 버튼 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onMaximize}
              className="h-8 w-8 p-0"
              title="Maximize"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* 상태 정보 */}
        <div className="p-3 space-y-2">
          {/* 스트리밍 상태 */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-500 font-medium">LIVE</span>
              </div>
              {fileType === 'video' && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  {isPlaying ? (
                    <Play className="w-3 h-3 fill-current" />
                  ) : (
                    <Pause className="w-3 h-3" />
                  )}
                  <span className="text-xs">{isPlaying ? 'Playing' : 'Paused'}</span>
                </div>
              )}
            </div>
            
            <span className="text-xs text-muted-foreground">
              to {connectedPeers} peer{connectedPeers !== 1 ? 's' : ''}
            </span>
          </div>
          
          {/* 메트릭스 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {fps > 0 && <span>{fps} fps</span>}
              {fileType === 'pdf' && totalPages > 0 && (
                <span>Page {currentPage}/{totalPages}</span>
              )}
            </div>
            {fileType === 'video' && (
              <span className="text-green-500">● Streaming active</span>
            )}
          </div>
          
          {/* 액션 버튼 */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReturnToCamera}
              className="flex-1 h-8"
            >
              <Camera className="w-3.5 h-3.5 mr-1.5" />
              Return to Camera
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onStop();
                toast.info('File streaming stopped');
              }}
              className="flex-1 h-8"
            >
              <StopCircle className="w-3.5 h-3.5 mr-1.5" />
              Stop
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};