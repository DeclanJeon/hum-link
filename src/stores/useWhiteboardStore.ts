import { create } from 'zustand';

type Tool = "pen" | "square" | "circle" | "eraser";

interface WhiteboardState {
  isDrawing: boolean;
  currentTool: Tool;
  startPos: { x: number; y: number };
  context: CanvasRenderingContext2D | null;
}

interface WhiteboardActions {
  setIsDrawing: (drawing: boolean) => void;
  setCurrentTool: (tool: Tool) => void;
  setStartPos: (pos: { x: number; y: number }) => void;
  setContext: (context: CanvasRenderingContext2D | null) => void;
  initializeCanvas: (canvas: HTMLCanvasElement) => void;
  getMousePos: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => { x: number; y: number };
  startDrawing: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => void;
  draw: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => void;
  stopDrawing: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => void;
  clearCanvas: (toast: any) => void;
  downloadCanvas: (canvas: HTMLCanvasElement, toast: any) => void;
  handleDrop: (e: React.DragEvent, toast: any) => void;
  reset: () => void;
}

export const useWhiteboardStore = create<WhiteboardState & WhiteboardActions>((set, get) => ({
  isDrawing: false,
  currentTool: "pen",
  startPos: { x: 0, y: 0 },
  context: null,

  setIsDrawing: (drawing: boolean) => set({ isDrawing: drawing }),
  
  setCurrentTool: (tool: Tool) => set({ currentTool: tool }),
  
  setStartPos: (pos: { x: number; y: number }) => set({ startPos: pos }),
  
  setContext: (context: CanvasRenderingContext2D | null) => set({ context }),

  initializeCanvas: (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    set({ context: ctx });

    ctx.font = "16px Inter";
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.fillText("Drag files here or start drawing...", 20, 40);
  },

  getMousePos: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  startDrawing: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const { currentTool, context } = get();
    const pos = get().getMousePos(e, canvas);
    
    set({ isDrawing: true, startPos: pos });

    if (currentTool === "pen" && context) {
      context.beginPath();
      context.moveTo(pos.x, pos.y);
    }
  },

  draw: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const { isDrawing, currentTool, context } = get();
    if (!isDrawing || !context) return;

    const pos = get().getMousePos(e, canvas);

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
  },

  stopDrawing: (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const { isDrawing, currentTool, context, startPos } = get();
    if (!isDrawing || !context) return;

    const pos = get().getMousePos(e, canvas);

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

    set({ isDrawing: false });
  },

  clearCanvas: (toast: any) => {
    const { context } = get();
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    
    if (!context || !canvas) return;
    
    context.clearRect(0, 0, canvas.width, canvas.height);
    toast.success("Whiteboard cleared");
  },

  downloadCanvas: (canvas: HTMLCanvasElement, toast: any) => {
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvas.toDataURL();
    link.click();
    
    toast.success("Whiteboard downloaded");
  },

  handleDrop: (e: React.DragEvent, toast: any) => {
    e.preventDefault();
    toast.success("File drop feature coming soon!");
  },

  reset: () => set({ 
    isDrawing: false, 
    currentTool: "pen", 
    startPos: { x: 0, y: 0 }, 
    context: null 
  })
}));