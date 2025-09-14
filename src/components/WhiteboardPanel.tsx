import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Pen, Square, Circle, Eraser, Download } from "lucide-react";
import { toast } from "sonner";

interface WhiteboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tool = "pen" | "square" | "circle" | "eraser";

// Formula 5: Innovative Solution - True collaboration hub
export const WhiteboardPanel = ({ isOpen, onClose }: WhiteboardPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>("pen");
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Configure drawing context
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    setContext(ctx);

    // Add some demo content
    ctx.font = "16px Inter";
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.fillText("Drag files here or start drawing...", 20, 40);
    
  }, []);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);

    if (currentTool === "pen" && context) {
      context.beginPath();
      context.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;

    const pos = getMousePos(e);

    switch (currentTool) {
      case "pen":
        context.lineTo(pos.x, pos.y);
        context.stroke();
        break;
      case "eraser":
        context.globalCompositeOperation = "destination-out";
        context.beginPath();
        context.arc(pos.x, pos.y, 10, 0, 2 * Math.PI);
        context.fill();
        context.globalCompositeOperation = "source-over";
        break;
    }
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;

    const pos = getMousePos(e);

    switch (currentTool) {
      case "square":
        const width = pos.x - startPos.x;
        const height = pos.y - startPos.y;
        context.strokeRect(startPos.x, startPos.y, width, height);
        break;
      case "circle":
        const radius = Math.sqrt(
          Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
        );
        context.beginPath();
        context.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        context.stroke();
        break;
    }

    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (!context || !canvasRef.current) return;
    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    toast.success("Whiteboard cleared");
  };

  const downloadCanvas = () => {
    if (!canvasRef.current) return;
    
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvasRef.current.toDataURL();
    link.click();
    
    toast.success("Whiteboard downloaded");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    toast.success("File drop feature coming soon!");
    // In real implementation: handle file uploads and embedding
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

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
          <Button variant="outline" size="sm" onClick={clearCanvas}>
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCanvas}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 p-4">
        <canvas
          ref={canvasRef}
          className="w-full h-[calc(100vh-180px)] whiteboard-canvas cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        />
        
        <p className="text-xs text-muted-foreground mt-2 text-center">
          💡 In real version: Drag files here to embed and collaborate
        </p>
      </div>
    </div>
  );
};