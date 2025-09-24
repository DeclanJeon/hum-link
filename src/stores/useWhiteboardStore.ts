import { create } from 'zustand';
import { usePeerConnectionStore } from './usePeerConnectionStore'; // useWebRTCStore에서 변경

type Tool = "pen" | "square" | "circle" | "eraser";

interface WhiteboardState {
  isDrawing: boolean;
  currentTool: Tool;
  startPos: { x: number; y: number };
  context: CanvasRenderingContext2D | null;
}

interface WhiteboardActions {
  initializeCanvas: (canvas: HTMLCanvasElement) => void;
  startDrawing: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  draw: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  stopDrawing: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleDrop: (e: React.DragEvent, toast: any) => void;
  clearCanvas: (toast: any) => void;
  downloadCanvas: (toast: any) => void;
  setCurrentTool: (tool: Tool) => void;
  applyRemoteDrawEvent: (event: any) => void;
  reset: () => void;
}

// 그리기 이벤트 데이터를 전송하는 헬퍼 함수
const sendDrawEvent = (event: any) => {
  const { sendToAllPeers } = usePeerConnectionStore.getState();
  const data = { type: 'whiteboard-event', payload: event };
  sendToAllPeers(JSON.stringify(data));
};

export const useWhiteboardStore = create<WhiteboardState & WhiteboardActions>((set, get) => ({
  isDrawing: false,
  currentTool: "pen",
  startPos: { x: 0, y: 0 },
  context: null,

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
  },

  setCurrentTool: (tool: Tool) => set({ currentTool: tool }),

  startDrawing: (e) => {
    const { context } = get();
    if (!context) return;
    const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    set({ isDrawing: true, startPos: pos });

    const event = { type: 'start', tool: get().currentTool, pos };
    get().applyRemoteDrawEvent(event); // 로컬에도 즉시 적용
    sendDrawEvent(event); // 다른 피어에게 전송
  },

  draw: (e) => {
    if (!get().isDrawing) return;
    const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    
    const event = { type: 'draw', tool: get().currentTool, pos };
    get().applyRemoteDrawEvent(event);
    sendDrawEvent(event);
  },

  stopDrawing: (e) => {
    if (!get().isDrawing) return;
    const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    
    const event = { type: 'stop', tool: get().currentTool, startPos: get().startPos, endPos: pos };
    get().applyRemoteDrawEvent(event);
    sendDrawEvent(event);
    set({ isDrawing: false });
  },

  handleDrop: (e: React.DragEvent, toast: any) => {
    e.preventDefault();
    const { context } = get();
    if (!context) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const pos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
          const drawEvent = { type: 'image', src: img.src, pos };
          get().applyRemoteDrawEvent(drawEvent);
          sendDrawEvent(drawEvent);
          toast.success("Image added to whiteboard!");
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      toast.warning("Only image files can be dropped on the whiteboard.");
    }
  },

  clearCanvas: (toast: any) => {
    const event = { type: 'clear' };
    get().applyRemoteDrawEvent(event);
    sendDrawEvent(event);
    toast.success("Whiteboard cleared");
  },

  downloadCanvas: (toast: any) => {
    const canvas = get().context?.canvas;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "singularity-whiteboard.png";
    link.href = canvas.toDataURL();
    link.click();
    toast.success("Whiteboard downloaded");
  },

  applyRemoteDrawEvent: (event: any) => {
    const { context, startPos } = get();
    if (!context) return;

    switch (event.type) {
      case 'start':
        context.beginPath();
        context.moveTo(event.pos.x, event.pos.y);
        break;
      case 'draw':
        if (event.tool === "pen") {
          context.lineTo(event.pos.x, event.pos.y);
          context.stroke();
        } else if (event.tool === "eraser") {
          context.globalCompositeOperation = "destination-out";
          context.beginPath();
          context.arc(event.pos.x, event.pos.y, 10, 0, 2 * Math.PI);
          context.fill();
          context.globalCompositeOperation = "source-over";
        }
        break;
      case 'stop':
        context.beginPath(); // 이전 경로와 분리
        if (event.tool === "square") {
          context.strokeRect(event.startPos.x, event.startPos.y, event.endPos.x - event.startPos.x, event.endPos.y - event.startPos.y);
        } else if (event.tool === "circle") {
          const radius = Math.sqrt(Math.pow(event.endPos.x - event.startPos.x, 2) + Math.pow(event.endPos.y - event.startPos.y, 2));
          context.arc(event.startPos.x, event.startPos.y, radius, 0, 2 * Math.PI);
          context.stroke();
        }
        break;
      case 'image':
        const img = new Image();
        img.onload = () => context.drawImage(img, event.pos.x, event.pos.y);
        img.src = event.src;
        break;
      case 'clear':
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        break;
    }
  },

  reset: () => set({ isDrawing: false, currentTool: "pen", startPos: { x: 0, y: 0 }, context: null })
}));
