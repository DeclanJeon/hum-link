// src/components/FileStreaming/ImageViewer.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCw, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { toast } from 'sonner';

interface ImageViewerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isStreaming: boolean;
}

export const ImageViewer = ({ canvasRef, isStreaming }: ImageViewerProps) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const rotateImage = () => {
    if (!canvasRef.current || isStreaming) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 임시 캔버스 생성
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx?.drawImage(canvas, 0, 0);
    
    // 캔버스 크기 교체
    const temp = canvas.width;
    canvas.width = canvas.height;
    canvas.height = temp;
    
    // 회전된 이미지 그리기
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2);
    ctx.restore();
    
    setRotation((rotation + 90) % 360);
    toast.info(`Image rotated to ${(rotation + 90) % 360}°`);
  };
  
  const changeZoom = (delta: number) => {
    if (!canvasRef.current || isStreaming) return;
    
    const newScale = Math.max(0.25, Math.min(4, scale + delta));
    setScale(newScale);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 현재 이미지 저장
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 스케일 적용
    const newWidth = canvas.width * (newScale / scale);
    const newHeight = canvas.height * (newScale / scale);
    
    // 임시 캔버스에 리사이즈
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx?.putImageData(imageData, 0, 0);
    
    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
    
    toast.info(`Zoom: ${Math.round(newScale * 100)}%`);
  };
  
  const resetView = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    toast.info('View reset');
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isStreaming) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isStreaming) return;
    
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-center gap-4 p-4 bg-secondary/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => changeZoom(-0.25)}
            size="sm"
            variant="outline"
            disabled={scale <= 0.25 || isStreaming}
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          
          <span className="text-sm font-medium w-16 text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <Button
            onClick={() => changeZoom(0.25)}
            size="sm"
            variant="outline"
            disabled={scale >= 4 || isStreaming}
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="w-px h-6 bg-border" />
        
        <Button
          onClick={rotateImage}
          size="sm"
          variant="outline"
          className="flex items-center gap-2"
          disabled={isStreaming}
          title="Rotate 90°"
        >
          <RotateCw className="w-4 h-4" />
          Rotate
        </Button>
        
        <Button
          onClick={resetView}
          size="sm"
          variant="outline"
          className="flex items-center gap-2"
          disabled={isStreaming}
          title="Reset view"
        >
          <Move className="w-4 h-4" />
          Reset
        </Button>
      </div>
      
      {/* Canvas Container with Pan support */}
      {!isStreaming && (
        <div 
          className="overflow-hidden cursor-move select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
        >
          {/* Canvas is rendered by parent component */}
        </div>
      )}
      
      {/* Streaming mode notice */}
      {isStreaming && (
        <div className="text-center text-sm text-muted-foreground">
          Image controls are disabled during streaming
        </div>
      )}
    </div>
  );
};