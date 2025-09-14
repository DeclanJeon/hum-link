import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Pen, Square, Circle, Eraser, Download } from "lucide-react";
import { toast } from "sonner";
import { useWhiteboardStore } from "@/stores/useWhiteboardStore";

interface WhiteboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Formula 5: Innovative Solution - True collaboration hub
export const WhiteboardPanel = ({ isOpen, onClose }: WhiteboardPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    isDrawing,
    currentTool,
    initializeCanvas,
    setCurrentTool,
    startDrawing,
    draw,
    stopDrawing,
    clearCanvas,
    downloadCanvas,
    handleDrop
  } = useWhiteboardStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    initializeCanvas(canvas);
  }, [initializeCanvas]);

  if (!isOpen) return null;


  return (
    <div className="fixed left-0 top-0 h-full w-96 bg-card/95 backdrop-blur-xl border-r border-border/50 shadow-[var(--shadow-elegant)] z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/30">
        <h3 className="font-semibold text-foreground">Collaborative Whiteboard</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tools */}
      <div className="p-4 border-b border-border/30">
        <div className="flex gap-2 mb-3">
          <Button
            variant={currentTool === "pen" ? "default" : "secondary"}
            size="sm"
            onClick={() => setCurrentTool("pen")}
          >
            <Pen className="w-4 h-4" />
          </Button>
          <Button
            variant={currentTool === "square" ? "default" : "secondary"}
            size="sm"
            onClick={() => setCurrentTool("square")}
          >
            <Square className="w-4 h-4" />
          </Button>
          <Button
            variant={currentTool === "circle" ? "default" : "secondary"}
            size="sm"
            onClick={() => setCurrentTool("circle")}
          >
            <Circle className="w-4 h-4" />
          </Button>
          <Button
            variant={currentTool === "eraser" ? "default" : "secondary"}
            size="sm"
            onClick={() => setCurrentTool("eraser")}
          >
            <Eraser className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => clearCanvas(toast)}>
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCanvas(canvasRef.current!, toast)}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 p-4">
        <canvas
          ref={canvasRef}
          className="w-full h-[calc(100vh-180px)] whiteboard-canvas cursor-crosshair"
          onMouseDown={(e) => startDrawing(e, canvasRef.current!)}
          onMouseMove={(e) => draw(e, canvasRef.current!)}
          onMouseUp={(e) => stopDrawing(e, canvasRef.current!)}
          onMouseLeave={(e) => stopDrawing(e, canvasRef.current!)}
          onDrop={(e) => handleDrop(e, toast)}
          onDragOver={(e) => e.preventDefault()}
        />
        
        <p className="text-xs text-muted-foreground mt-2 text-center">
          💡 In real version: Drag files here to embed and collaborate
        </p>
      </div>
    </div>
  );
};