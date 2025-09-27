/// <reference lib="webworker" />

// PDF.js를 동적으로 import
let pdfjsLib: any = null;

interface PDFWorkerMessage {
  type: 'load' | 'render' | 'destroy';
  payload: any;
}

class PDFWorker {
  private pdfDoc: any = null;
  private currentRenderTask: any = null;
  
  constructor() {
    self.onmessage = this.handleMessage.bind(this);
    this.initializePdfJs();
  }
  
  private async initializePdfJs() {
    try {
      // PDF.js를 동적으로 로드
      pdfjsLib = await import('pdfjs-dist');
      
      // Worker를 인라인으로 설정
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      
      console.log('[PDFWorker] PDF.js initialized with version:', pdfjsLib.version);
    } catch (error) {
      console.error('[PDFWorker] Failed to initialize PDF.js:', error);
      self.postMessage({
        type: 'error',
        payload: { error: 'Failed to initialize PDF.js' }
      });
    }
  }
  
  private async handleMessage(event: MessageEvent<PDFWorkerMessage>) {
    const { type, payload } = event.data;
    
    // PDF.js가 아직 로드되지 않았으면 대기
    if (!pdfjsLib && type !== 'destroy') {
      console.log('[PDFWorker] Waiting for PDF.js to initialize...');
      setTimeout(() => this.handleMessage(event), 100);
      return;
    }
    
    try {
      switch (type) {
        case 'load':
          await this.loadPDF(payload.data);
          break;
          
        case 'render':
          await this.renderPage(payload.pageNumber, payload.scale);
          break;
          
        case 'destroy':
          this.destroy();
          break;
          
        default:
          console.warn(`[PDFWorker] Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error('[PDFWorker] Error:', error);
      self.postMessage({
        type: 'error',
        payload: {
          error: (error as Error).message || 'Unknown error'
        }
      });
    }
  }
  
  private async loadPDF(data: ArrayBuffer) {
    try {
      if (this.pdfDoc) {
        await this.pdfDoc.destroy();
        this.pdfDoc = null;
      }
      
      console.log('[PDFWorker] Loading PDF, size:', data.byteLength);
      
      const loadingTask = pdfjsLib.getDocument({
        data: data,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true
      });
      
      this.pdfDoc = await loadingTask.promise;
      
      console.log('[PDFWorker] PDF loaded successfully, pages:', this.pdfDoc.numPages);
      
      self.postMessage({
        type: 'loaded',
        payload: {
          numPages: this.pdfDoc.numPages,
          fingerprint: this.pdfDoc.fingerprints?.[0] || 'unknown'
        }
      });
    } catch (error) {
      console.error('[PDFWorker] Failed to load PDF:', error);
      throw error;
    }
  }
  
  private async renderPage(pageNumber: number, scale: number = 1.5) {
    if (!this.pdfDoc) {
      throw new Error('PDF document not loaded');
    }
    
    try {
      if (this.currentRenderTask) {
        try {
          await this.currentRenderTask.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        this.currentRenderTask = null;
      }
      
      console.log(`[PDFWorker] Rendering page ${pageNumber} at scale ${scale}`);
      
      const page = await this.pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      
      // OffscreenCanvas를 지원하는지 확인
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(
          Math.floor(viewport.width),
          Math.floor(viewport.height)
        );
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Failed to get canvas context');
        }
        
        this.currentRenderTask = page.render({
          canvasContext: context as any,
          viewport: viewport
        });
        
        await this.currentRenderTask.promise;
        
        const blob = await canvas.convertToBlob({
          type: 'image/png',
          quality: 0.95
        });
        
        self.postMessage({
          type: 'rendered',
          payload: {
            pageNumber,
            blob,
            width: viewport.width,
            height: viewport.height
          }
        });
      } else {
        // OffscreenCanvas를 지원하지 않는 경우 데이터만 전송
        self.postMessage({
          type: 'render-data',
          payload: {
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            scale
          }
        });
      }
      
      this.currentRenderTask = null;
      console.log(`[PDFWorker] Page ${pageNumber} rendered successfully`);
      
    } catch (error: any) {
      if (error.name === 'RenderingCancelledException') {
        console.log('[PDFWorker] Rendering cancelled');
      } else {
        console.error('[PDFWorker] Failed to render page:', error);
        throw error;
      }
    }
  }
  
  private destroy() {
    if (this.currentRenderTask) {
      this.currentRenderTask.cancel().catch(() => {});
      this.currentRenderTask = null;
    }
    
    if (this.pdfDoc) {
      this.pdfDoc.destroy().catch(() => {});
      this.pdfDoc = null;
    }
    
    console.log('[PDFWorker] Worker destroyed');
    self.close();
  }
}

new PDFWorker();