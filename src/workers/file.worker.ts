/// <reference lib="webworker" />
import { 
  calculateOptimalChunkSize, 
  calculateTotalChunks,
  calculateFileOffset,
  calculateActualChunkSize,
  calculateTransferSpeed
} from '../lib/fileTransferUtils';

declare const self: DedicatedWorkerGlobalScope;

type NetworkQuality = 'excellent' | 'good' | 'moderate' | 'poor';
type TransferPhase = 'burst' | 'recovery' | 'complete';

interface ChunkState {
  sent: boolean;
  acked: boolean;
  retries: number;
  lastSentTime: number;
  size: number;
}

// DataChannel 버퍼를 고려한 안전한 설정
const TRANSFER_CONFIGS = {
  excellent: {
    windowSize: 30,       // 줄임
    batchSize: 10,        // 줄임
    timeout: 10000,
    maxRetries: 2,
    sendDelay: 10         // 10ms 지연 추가
  },
  good: {
    windowSize: 20,       
    batchSize: 5,         
    timeout: 10000,
    maxRetries: 3,
    sendDelay: 20         // 20ms 지연
  },
  moderate: {
    windowSize: 10,       
    batchSize: 3,         
    timeout: 15000,
    maxRetries: 3,
    sendDelay: 30         // 30ms 지연
  },
  poor: {
    windowSize: 5,
    batchSize: 2,
    timeout: 20000,
    maxRetries: 4,
    sendDelay: 50
  }
};

const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFER_CHECK_INTERVAL = 100; // 버퍼 체크 간격

class FlowControlFileWorker {
  private file: File | null = null;
  private transferId: string = '';
  private chunkSize: number = CHUNK_SIZE;
  private totalChunks: number = 0;
  
  private phase: TransferPhase = 'burst';
  private chunkStates: Map<number, ChunkState> = new Map();
  private isCancelled: boolean = false;
  private isPaused: boolean = false;
  
  private networkQuality: NetworkQuality = 'moderate';
  private currentConfig = TRANSFER_CONFIGS.moderate;
  
  private startTime: number = 0;
  private bytesTransferred: number = 0;
  private bytesSent: number = 0;
  private lastProgressReport: number = 0;
  
  private inFlightChunks: Set<number> = new Set();
  private currentWindowSize: number = 10;
  private consecutiveErrors: number = 0;
  private bufferFullCount: number = 0;
  
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    self.onmessage = this.handleMessage.bind(this);
  }

  private async handleMessage(event: MessageEvent) {
    const { type, payload } = event.data;

    switch (type) {
      case 'start-transfer':
        await this.startTransfer(payload.file, payload.transferId);
        break;
        
      case 'ack-received':
        this.handleAckReceived(payload.transferId, payload.chunkIndex);
        break;
        
      case 'buffer-status':
        this.handleBufferStatus(payload.canSend);
        break;
        
      case 'cancel-transfer':
        this.cancelTransfer();
        break;
        
      case 'pause-transfer':
        this.pauseTransfer();
        break;
        
      case 'resume-transfer':
        this.resumeTransfer();
        break;
        
      default:
        console.warn(`[FlowWorker] Unknown message type: ${type}`);
    }
  }

  private async startTransfer(file: File, transferId: string) {
    this.file = file;
    this.transferId = transferId;
    this.chunkSize = CHUNK_SIZE;
    this.totalChunks = calculateTotalChunks(file.size, this.chunkSize);
    this.startTime = Date.now();
    this.isCancelled = false;
    this.isPaused = false;

    console.log(`[FlowWorker] Starting transfer with flow control`);
    console.log(`[FlowWorker] File: ${(file.size / (1024*1024)).toFixed(2)}MB, ${this.totalChunks} chunks`);

    try {
      // 청크 상태 초기화
      this.initializeChunkStates();
      
      // 네트워크 품질 설정
      this.detectNetworkQuality();
      
      // 흐름 제어 전송
      await this.flowControlTransfer();
      
      // 복구 단계
      await this.recoveryPhase();
      
      // 완료 처리
      await this.completeTransfer();
      
    } catch (error) {
      console.error(`[FlowWorker] Transfer failed:`, error);
      this.reportError((error as Error).message);
    } finally {
      this.cleanup();
    }
  }

  private detectNetworkQuality() {
    const fileSizeMB = this.file!.size / (1024 * 1024);
    
    if (fileSizeMB < 10) {
      this.networkQuality = 'good';
      this.currentWindowSize = 20;
    } else if (fileSizeMB < 100) {
      this.networkQuality = 'moderate';
      this.currentWindowSize = 10;
    } else {
      this.networkQuality = 'moderate';
      this.currentWindowSize = 5;
    }
    
    this.currentConfig = TRANSFER_CONFIGS[this.networkQuality];
    console.log(`[FlowWorker] Network: ${this.networkQuality}, initial window: ${this.currentWindowSize}`);
  }

  private async flowControlTransfer() {
    this.phase = 'burst';
    console.log(`[FlowWorker] Starting flow-controlled transfer`);
    
    let nextChunk = 0;
    let lastStatusTime = Date.now();
    
    // 타임아웃 체크
    this.checkInterval = setInterval(() => {
      this.checkTimeouts();
    }, 2000) as any;
    
    while (nextChunk < this.totalChunks || this.inFlightChunks.size > 0) {
      if (this.isCancelled) break;
      
      // 일시정지 처리
      while (this.isPaused && !this.isCancelled) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 윈도우 크기 제한
      while (this.inFlightChunks.size < this.currentWindowSize && nextChunk < this.totalChunks) {
        // 버퍼 체크 메시지 전송
        if (Date.now() - lastStatusTime > BUFFER_CHECK_INTERVAL) {
          self.postMessage({
            type: 'check-buffer',
            payload: { transferId: this.transferId }
          });
          lastStatusTime = Date.now();
        }
        
        // 청크 전송
        await this.sendChunkWithFlowControl(nextChunk);
        nextChunk++;
        
        // 전송 간 지연 (버퍼 오버플로우 방지)
        await new Promise(resolve => setTimeout(resolve, this.currentConfig.sendDelay));
      }
      
      // 진행률 보고
      this.reportProgress();
      
      // 대기
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 윈도우 조정
      this.adjustWindowSize();
    }
  }

  
  private async sendChunkWithFlowControl(chunkIndex: number): Promise<void> {
    if (!this.file || this.isCancelled) return;
    
    const state = this.chunkStates.get(chunkIndex);
    if (!state || state.sent) return;
    
    try {
      const offset = calculateFileOffset(chunkIndex, this.chunkSize);
      const size = calculateActualChunkSize(this.file.size, chunkIndex, this.chunkSize);
      const blob = this.file.slice(offset, offset + size);
      const data = await blob.arrayBuffer();
      
      const packet = this.createChunkPacket(chunkIndex, data);
      
      state.sent = true;
      state.lastSentTime = Date.now();
      this.bytesSent += size;
      this.inFlightChunks.add(chunkIndex);
      
      // 청크 전송 시 인덱스도 함께 전달
      self.postMessage({
        type: 'chunk-ready',
        payload: {
          transferId: this.transferId,
          chunk: packet,
          chunkIndex, // 추가
          needsFlowControl: true
        }
      }, [packet]);
      
      // 전송 직후 진행률 업데이트
      this.reportProgress();
      
      this.consecutiveErrors = 0;
      
    } catch (error: any) {
      console.error(`[FlowWorker] Error sending chunk ${chunkIndex}:`, error);
      state.sent = false;
      this.inFlightChunks.delete(chunkIndex);
      
      if (error.message?.includes('queue is full')) {
        this.bufferFullCount++;
        this.consecutiveErrors++;
        this.currentWindowSize = Math.max(1, Math.floor(this.currentWindowSize / 2));
        await new Promise(resolve => setTimeout(resolve, 100 * this.consecutiveErrors));
      }
      
      throw error;
    }
  }


  private createChunkPacket(chunkIndex: number, data: ArrayBuffer): ArrayBuffer {
    const transferIdBytes = new TextEncoder().encode(this.transferId);
    const headerSize = 1 + 2 + transferIdBytes.length + 4;
    const packet = new ArrayBuffer(headerSize + data.byteLength);
    const view = new DataView(packet);
    
    view.setUint8(0, 1); // Type: Data Chunk
    view.setUint16(1, transferIdBytes.length, false);
    new Uint8Array(packet, 3, transferIdBytes.length).set(transferIdBytes);
    view.setUint32(3 + transferIdBytes.length, chunkIndex, false);
    new Uint8Array(packet, headerSize).set(new Uint8Array(data));
    
    return packet;
  }

  private checkTimeouts() {
    const now = Date.now();
    const timeout = this.currentConfig.timeout;
    let timedOutCount = 0;
    
    for (const chunkIndex of this.inFlightChunks) {
      const state = this.chunkStates.get(chunkIndex);
      if (state && state.sent && !state.acked) {
        if (now - state.lastSentTime > timeout) {
          console.warn(`[FlowWorker] Chunk ${chunkIndex} timed out`);
          state.sent = false;
          state.retries++;
          this.inFlightChunks.delete(chunkIndex);
          timedOutCount++;
        }
      }
    }
    
    // 타임아웃이 많으면 윈도우 크기 감소
    if (timedOutCount > 0) {
      this.currentWindowSize = Math.max(1, this.currentWindowSize - timedOutCount);
      console.log(`[FlowWorker] ${timedOutCount} timeouts, window reduced to ${this.currentWindowSize}`);
    }
  }

  private adjustWindowSize() {
    // 버퍼 풀 빈도에 따라 조정
    if (this.bufferFullCount > 5) {
      this.currentWindowSize = Math.max(1, this.currentWindowSize - 1);
      this.bufferFullCount = 0;
      console.log(`[FlowWorker] Frequent buffer full, window: ${this.currentWindowSize}`);
    } else if (this.consecutiveErrors === 0 && this.inFlightChunks.size === 0) {
      // 모든 청크가 성공적으로 전송되면 증가
      this.currentWindowSize = Math.min(
        this.currentConfig.windowSize,
        this.currentWindowSize + 1
      );
    }
  }

  private async recoveryPhase() {
    this.phase = 'recovery';
    
    // 대기
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const missingChunks: number[] = [];
    
    for (const [index, state] of this.chunkStates.entries()) {
      if (!state.acked && state.retries < this.currentConfig.maxRetries) {
        missingChunks.push(index);
      }
    }
    
    if (missingChunks.length === 0) {
      console.log('[FlowWorker] No recovery needed');
      return;
    }
    
    console.log(`[FlowWorker] Recovery: ${missingChunks.length} missing chunks`);
    
    // 천천히 재전송
    for (const chunkIndex of missingChunks) {
      if (this.isCancelled) break;
      
      const state = this.chunkStates.get(chunkIndex);
      if (state && !state.acked) {
        state.sent = false;
        await this.sendChunkWithFlowControl(chunkIndex);
        await new Promise(resolve => setTimeout(resolve, 100)); // 재전송 간 대기
      }
    }
  }

  private handleAckReceived(transferId: string, chunkIndex: number) {
    if (transferId !== this.transferId) return;
    
    const state = this.chunkStates.get(chunkIndex);
    if (!state || state.acked) return;
    
    state.acked = true;
    this.bytesTransferred += state.size;
    this.inFlightChunks.delete(chunkIndex);
    
    // ACK 받을 때마다 즉시 진행률 리포트
    this.reportProgress();
    
    // RTT 기반 윈도우 조정
    const rtt = Date.now() - state.lastSentTime;
    
    if (rtt < 50) {
      this.currentWindowSize = Math.min(
        this.currentConfig.windowSize,
        this.currentWindowSize + 1
      );
    } else if (rtt > 500) {
      this.currentWindowSize = Math.max(2, this.currentWindowSize - 1);
    }
  }

  private handleBufferStatus(canSend: boolean) {
    if (!canSend) {
      // 버퍼가 가득 참
      this.bufferFullCount++;
      this.currentWindowSize = Math.max(1, Math.floor(this.currentWindowSize * 0.8));
      console.log(`[FlowWorker] Buffer full signal, window: ${this.currentWindowSize}`);
    }
  }

  private reportProgress() {
    const now = Date.now();
    // 50ms마다 업데이트 (더 빠르게)
    if (now - this.lastProgressReport < 50) return;
    
    this.lastProgressReport = now;
    
    const sentCount = Array.from(this.chunkStates.values()).filter(s => s.sent).length;
    const ackedCount = Array.from(this.chunkStates.values()).filter(s => s.acked).length;
    
    const actualProgress = ackedCount / this.totalChunks;
    const expectedProgress = sentCount / this.totalChunks;
    
    const elapsedSeconds = (now - this.startTime) / 1000;
    const actualSpeed = this.bytesTransferred / elapsedSeconds;
    const sendSpeed = this.bytesSent / elapsedSeconds;
    
    // 매번 progress 업데이트 전송
    self.postMessage({
      type: 'progress-update',
      payload: {
        transferId: this.transferId,
        loaded: this.bytesTransferred,
        total: this.file!.size,
        progress: actualProgress,
        sendProgress: expectedProgress,
        speed: actualSpeed,
        sendSpeed: sendSpeed,
        chunksAcked: ackedCount,
        chunksSent: sentCount,
        totalChunks: this.totalChunks,
        windowSize: this.currentWindowSize,
        inFlight: this.inFlightChunks.size,
        phase: this.phase,
        elapsedTime: elapsedSeconds
      }
    });
    
    // 디버그 메시지 (메인 스레드로)
    if (Math.floor(actualProgress * 20) !== Math.floor(this.lastLoggedProgress * 20)) {
      self.postMessage({
        type: 'debug-log',
        payload: {
          message: `Progress: ${(actualProgress * 100).toFixed(1)}% (ACK: ${ackedCount}/${this.totalChunks}, Sent: ${sentCount}/${this.totalChunks})`
        }
      });
      this.lastLoggedProgress = actualProgress;
    }
  }
    
  private lastLoggedProgress: number = 0;  

  private async completeTransfer() {
    this.phase = 'complete';
    
    await this.sendEndSignal();
    
    const duration = Date.now() - this.startTime;
    const avgSpeed = this.bytesTransferred / (duration / 1000);
    const ackedCount = Array.from(this.chunkStates.values()).filter(s => s.acked).length;
    
    console.log(
      `[FlowWorker] Complete: ${(duration/1000).toFixed(1)}s, ` +
      `${(avgSpeed/1024/1024).toFixed(2)}MB/s, ` +
      `${ackedCount}/${this.totalChunks} chunks`
    );
    
    self.postMessage({
      type: 'transfer-complete',
      payload: {
        transferId: this.transferId,
        duration,
        avgSpeed,
        totalBytes: this.bytesTransferred,
        totalChunks: this.totalChunks,
        ackedChunks: ackedCount
      }
    });
  }

  private async sendEndSignal() {
    const transferIdBytes = new TextEncoder().encode(this.transferId);
    const packet = new ArrayBuffer(3 + transferIdBytes.length);
    const view = new DataView(packet);
    
    view.setUint8(0, 2);
    view.setUint16(1, transferIdBytes.length, false);
    new Uint8Array(packet, 3).set(transferIdBytes);
    
    for (let i = 0; i < 3; i++) {
      self.postMessage({
        type: 'chunk-ready',
        payload: {
          transferId: this.transferId,
          chunk: packet.slice(0)
        }
      }, [packet.slice(0)]);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private initializeChunkStates() {
    for (let i = 0; i < this.totalChunks; i++) {
      const size = calculateActualChunkSize(this.file!.size, i, this.chunkSize);
      this.chunkStates.set(i, {
        sent: false,
        acked: false,
        retries: 0,
        lastSentTime: 0,
        size
      });
    }
  }

  private reportError(error: string) {
    self.postMessage({
      type: 'transfer-error',
      payload: { transferId: this.transferId, error }
    });
  }

  private cancelTransfer() {
    this.isCancelled = true;
    self.postMessage({
      type: 'transfer-cancelled',
      payload: { transferId: this.transferId }
    });
    this.cleanup();
  }

  private pauseTransfer() {
    this.isPaused = true;
  }

  private resumeTransfer() {
    this.isPaused = false;
  }

  private cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval as any);
    }
    
    this.chunkStates.clear();
    this.inFlightChunks.clear();
    this.file = null;
    
    self.close();
  }
}

new FlowControlFileWorker();