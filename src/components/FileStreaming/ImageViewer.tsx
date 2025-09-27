import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';

interface ImageViewerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const ImageViewer = ({ canvasRef }: ImageViewerProps) => {
  const rotateImage = () => {
    if (!canvasRef.current) return;
    
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
    
    toast.info('Image rotated');
  };

  return (
    <div className="flex items-center justify-center p-4 bg-secondary/50 rounded-lg">
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
  );
};
