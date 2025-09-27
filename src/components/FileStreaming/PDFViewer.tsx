import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import * as pdfjs from 'pdfjs-dist';
import { toast } from 'sonner';

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const PDFViewer = ({ canvasRef }: PDFViewerProps) => {
  const {
    pdfDoc,
    currentPage,
    totalPages,
    setCurrentPage,
    setPdfDoc,
    setTotalPages,
    selectedFile
  } = useFileStreamingStore();

  useEffect(() => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      loadPDF(selectedFile);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPDFPage(pdfDoc, currentPage);
    }
  }, [pdfDoc, currentPage]);

  const loadPDF = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (error) {
      console.error('Failed to load PDF:', error);
      toast.error('Failed to load PDF file');
    }
  };

  const renderPDFPage = async (pdf: any, pageNum: number) => {
    if (!canvasRef.current) return;
    
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
    } catch (error) {
      console.error('Failed to render PDF page:', error);
    }
  };

  const navigatePage = async (direction: 'next' | 'prev') => {
    if (!pdfDoc) return;
    
    let newPage = currentPage;
    if (direction === 'next' && currentPage < totalPages) {
      newPage = currentPage + 1;
    } else if (direction === 'prev' && currentPage > 1) {
      newPage = currentPage - 1;
    }
    
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
      toast.info(`Page ${newPage} of ${totalPages}`);
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value);
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (!pdfDoc) return null;

  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-secondary/50 rounded-lg">
      <Button
        onClick={() => navigatePage('prev')}
        disabled={currentPage === 1}
        size="sm"
        variant="outline"
      >
        <ChevronLeft className="w-4 h-4" />
        Previous
      </Button>
      
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={currentPage}
          onChange={handlePageInputChange}
          className="w-16 px-2 py-1 text-center border rounded"
          min={1}
          max={totalPages}
        />
        <span className="text-sm">of {totalPages}</span>
      </div>
      
      <Button
        onClick={() => navigatePage('next')}
        disabled={currentPage === totalPages}
        size="sm"
        variant="outline"
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
};
