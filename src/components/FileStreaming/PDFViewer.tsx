import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  file: File;
  isStreaming: boolean;
}

export const PDFViewer = ({ canvasRef, file, isStreaming }: PDFViewerProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1.5);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const renderTaskRef = useRef<any>(null);
  
  const {
    currentPage,
    totalPages,
    setCurrentPage,
    setTotalPages
  } = useFileStreamingStore();
  
  // PDF 로드
  useEffect(() => {
    let isMounted = true;
    
    const loadPDF = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
        });
        
        const pdf = await loadingTask.promise;
        
        if (isMounted) {
          setPdfDocument(pdf);
          setTotalPages(pdf.numPages);
          setCurrentPage(1);
          setIsLoading(false);
          toast.success(`PDF loaded: ${pdf.numPages} pages`);
        }
      } catch (error) {
        console.error('[PDFViewer] Failed to load PDF:', error);
        if (isMounted) {
          setError(`Failed to load PDF: ${error}`);
          setIsLoading(false);
          displayErrorOnCanvas();
        }
      }
    };
    
    loadPDF();
    
    return () => {
      isMounted = false;
      if (pdfDocument) {
        pdfDocument.destroy();
      }
    };
  }, [file]);
  
  // 페이지 렌더링
  useEffect(() => {
    if (pdfDocument && currentPage > 0 && canvasRef.current) {
      renderPage();
    }
  }, [pdfDocument, currentPage, scale, rotation]);
  
  const renderPage = async () => {
    if (!pdfDocument || !canvasRef.current) return;
    
    setIsLoading(true);
    
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      
      const page = await pdfDocument.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      
      const rotateValue = rotation;
      const viewport = page.getViewport({ scale, rotation: rotateValue });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Failed to get canvas context');
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'display'
      };
      
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
      
      setIsLoading(false);
      console.log(`[PDFViewer] Page ${currentPage} rendered successfully`);
      
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('[PDFViewer] Failed to render page:', error);
        setError(`Failed to render page: ${error.message}`);
      }
      setIsLoading(false);
    }
  };
  
  const displayErrorOnCanvas = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    canvas.width = 800;
    canvas.height = 600;
    
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PDF Preview Error', canvas.width / 2, canvas.height / 2 - 60);
    
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText('Unable to load PDF file', canvas.width / 2, canvas.height / 2 - 20);
    
    ctx.fillText(`File: ${file.name}`, canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText(`Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`, canvas.width / 2, canvas.height / 2 + 50);
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  };
  
  const navigatePage = (direction: 'next' | 'prev') => {
    let newPage = currentPage;
    
    if (direction === 'next' && currentPage < totalPages) {
      newPage = currentPage + 1;
    } else if (direction === 'prev' && currentPage > 1) {
      newPage = currentPage - 1;
    }
    
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
      
      // 스트리밍 중일 때 페이지 변경 알림
      if (isStreaming) {
        toast.info(`Sharing page ${newPage} of ${totalPages}`, {
          duration: 1000,
          position: 'top-center'
        });
      }
    }
  };
  
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      
      // 스트리밍 중일 때 페이지 변경 알림
      if (isStreaming) {
        toast.info(`Sharing page ${page} of ${totalPages}`, {
          duration: 1000,
          position: 'top-center'
        });
      }
    }
  };
  
  const changeZoom = (delta: number) => {
    const newScale = Math.max(0.5, Math.min(3, scale + delta));
    setScale(newScale);
  };
  
  const rotate = () => {
    setRotation((rotation + 90) % 360);
  };
  
  return (
    <div className="space-y-4">
      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-semibold">PDF Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}
      
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 p-4 bg-secondary/50 rounded-lg">
        {/* Page Navigation - isStreaming 조건 제거 */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigatePage('prev')}
            disabled={currentPage <= 1 || isLoading || !pdfDocument}
            size="sm"
            variant="outline"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={currentPage || 1}
              onChange={handlePageInputChange}
              className="w-16 px-2 py-1 text-center border rounded"
              min={1}
              max={totalPages || 1}
              disabled={isLoading || !pdfDocument}
            />
            <span className="text-sm">of {totalPages || '?'}</span>
          </div>
          
          <Button
            onClick={() => navigatePage('next')}
            disabled={currentPage >= totalPages || isLoading || !pdfDocument}
            size="sm"
            variant="outline"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Zoom and Rotate Controls - isStreaming 조건 제거 */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => changeZoom(-0.25)}
            disabled={scale <= 0.5 || isLoading || !pdfDocument}
            size="sm"
            variant="outline"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          
          <span className="text-sm font-medium w-16 text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <Button
            onClick={() => changeZoom(0.25)}
            disabled={scale >= 3 || isLoading || !pdfDocument}
            size="sm"
            variant="outline"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <Button
            onClick={rotate}
            disabled={isLoading || !pdfDocument}
            size="sm"
            variant="outline"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Streaming indicator */}
      {isStreaming && (
        <div className="text-center text-sm text-blue-500 animate-pulse">
          📡 Live streaming to {usePeerConnectionStore.getState().peers.size || 0} participant{usePeerConnectionStore.getState().peers.size !== 1 ? 's' : ''}
        </div>
      )}
      
      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2">Loading PDF...</span>
        </div>
      )}
      
      {/* Canvas is rendered by parent component */}
      {!pdfDocument && !isLoading && !error && (
        <div className="text-center text-muted-foreground p-8">
          <p>Loading PDF document...</p>
        </div>
      )}
    </div>
  );
};
