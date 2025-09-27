import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface StreamCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isStreaming: boolean;
}

export const StreamCanvas = ({ canvasRef, isStreaming }: StreamCanvasProps) => {
  return (
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
  );
};
