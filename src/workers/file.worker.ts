/// <reference lib="webworker" />
import { 
  calculateOptimalChunkSize, 
  calculateTotalChunks,
  calculateFileOffset,
  calculateActualChunkSize,
  calculateTransferSpeed
} from '../lib/fileTransferUtils';

declare const self: DedicatedWorkerGlobalScope;

// 슬라이딩 윈도우 설정 (64KB 청크에 맞게 조정)
const INITIAL_WINDOW_SIZE = 5; // 초기 윈도우 크기
const MAX_WINDOW_SIZE = 30; // 최대 윈도우 크기 증가
const MIN_WINDOW_SIZE = 2; // 최소 윈도우 크기
const ACK_TIMEOUT_MS = 15000; // ACK 타임아웃 (15초)
const MAX_RETRIES = 3; // 최대 재시도 횟수
const SEND_DELAY_MS = 10; // 청크 간 전송 지연 (10ms로 증가)

interface ChunkInfo {
  index: number;
  data: ArrayBuffer;
  retries: number;
  sentTime: number;
}

interface TransferMetrics {
  startTime: number;
  bytesTransferred: number;
  chunksAcked: number;
  totalChunks: number;
  currentWindowSize: number;
  rttHistory: number[];
  errors: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

class FileTransferWorker {
  private pendingAcks: Map<string, () => void> = new Map();
  private inFlightChunks: Map<number, ChunkInfo> = new Map();
  private metrics: TransferMetrics | null = null;
  private chunkSize: number = 0;
  private file: File | null = null;
  private transferId: string = '';
  private isCancelled: boolean = false;
  private isPaused: boolean = false;
  private checkTimeoutInterval: NodeJS.Timeout | null = null;

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
        console.warn(`[FileWorker] Unknown message type: ${type}`);
    }
  }

  private async startTransfer(file: File, transferId: string) {
    this.file = file;
    this.transferId = transferId;
    this.isCancelled = false;
    this.isPaused = false;
    
    // 파일 크기에 따른 최적 청크 크기 계산
    this.chunkSize = calculateOptimalChunkSize(file.size);
    const totalChunks = calculateTotalChunks(file.size, this.chunkSize);

    // 메트릭 초기화
    this.metrics = {
      startTime: Date.now(),
      bytesTransferred: 0,
      chunksAcked: 0,
      totalChunks,
      currentWindowSize: INITIAL_WINDOW_SIZE,
      rttHistory: [],
      errors: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0
    };

    console.log(`[FileWorker] Starting transfer: ${transferId}`);
    console.log(`[FileWorker] File size: ${file.size}, Chunk size: ${this.chunkSize}, Total chunks: ${totalChunks}`);

    try {
      await this.transferWithSlidingWindow();
    } catch (error) {
      console.error(`[FileWorker] Transfer failed: ${transferId}`, error);
      self.postMessage({
        type: 'transfer-error',
        payload: { 
          transferId, 
          error: (error as Error).message 
        }
      });
    } finally {
      if (!this.isCancelled) {
        this.cleanup();
      }
    }
  }

  private async transferWithSlidingWindow() {
    if (!this.file || !this.metrics) return;

    let nextChunkToSend = 0;
    const totalChunks = this.metrics.totalChunks;

    // 타임아웃 체크 인터벌 설정
    this.checkTimeoutInterval = setInterval(() => {
      this.checkForTimeouts();
    }, 1000) as any;

    while (this.metrics.chunksAcked < totalChunks && !this.isCancelled) {
      // 일시정지 상태 확인
      while (this.isPaused && !this.isCancelled) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 윈도우를 채움
      while (
        this.inFlightChunks.size < this.metrics.currentWindowSize &&
        nextChunkToSend < totalChunks &&
        !this.isCancelled &&
        !this.isPaused
      ) {
        await this.sendChunk(nextChunkToSend);
        nextChunkToSend++;
        
        // 청크 간 짧은 지연 추가 (버퍼 오버플로우 방지)
        if (SEND_DELAY_MS > 0) {
          await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS));
        }
      }

      // ACK 대기 또는 타임아웃 처리
      await this.waitForAcksOrTimeout();

      // 윈도우 크기 조정
      this.adjustWindowSize();

      // 진행 상황 보고
      this.reportProgress();
    }

    if (!this.isCancelled && this.metrics.chunksAcked === totalChunks) {
      await this.sendEndSignal();
      this.reportCompletion();
    }
  }

  private async sendChunk(chunkIndex: number, isRetry: boolean = false) {
    if (!this.file) return;

    const offset = calculateFileOffset(chunkIndex, this.chunkSize);
    const actualSize = calculateActualChunkSize(this.file.size, chunkIndex, this.chunkSize);
    
    const chunkBlob = this.file.slice(offset, offset + actualSize);
    const chunkBuffer = await chunkBlob.arrayBuffer();

    // 헤더 생성 (Type: 1 = Data Chunk, 4 bytes for index)
    const header = new ArrayBuffer(5);
    const headerView = new DataView(header);
    headerView.setUint8(0, 1); // Type: Data Chunk
    headerView.setUint32(1, chunkIndex, false); // Big-endian

    // 헤더와 데이터 결합
    const combined = new Uint8Array(header.byteLength + chunkBuffer.byteLength);
    combined.set(new Uint8Array(header), 0);
    combined.set(new Uint8Array(chunkBuffer), header.byteLength);

    // 전송 정보 저장 (원본 데이터 보관)
    if (!isRetry) {
      this.inFlightChunks.set(chunkIndex, {
        index: chunkIndex,
        data: combined.buffer.slice(0), // 복사본 저장
        retries: 0,
        sentTime: Date.now()
      });
    } else {
      const chunkInfo = this.inFlightChunks.get(chunkIndex);
      if (chunkInfo) {
        chunkInfo.sentTime = Date.now();
      }
    }

    // 메인 스레드로 청크 전송 (복사본 전송)
    const dataToSend = combined.buffer.slice(0);
    self.postMessage({
      type: 'chunk-ready',
      payload: {
        transferId: this.transferId,
        chunk: dataToSend,
        chunkIndex,
        isRetry
      }
    }, [dataToSend]); // Transferable로 전송
  }

  private async waitForAcksOrTimeout() {
    const checkInterval = 100; // 100ms마다 체크

    while (this.inFlightChunks.size > 0 && !this.isCancelled) {
      // 윈도우에 여유가 생기면 반환
      if (this.inFlightChunks.size < this.metrics!.currentWindowSize) {
        break;
      }

      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  private checkForTimeouts() {
    if (this.isCancelled || this.isPaused) return;

    const now = Date.now();
    
    for (const [chunkIndex, chunkInfo] of this.inFlightChunks.entries()) {
      if (now - chunkInfo.sentTime > ACK_TIMEOUT_MS) {
        this.handleChunkTimeout(chunkIndex).catch(error => {
          console.error(`[FileWorker] Error handling timeout for chunk ${chunkIndex}:`, error);
        });
      }
    }
  }

  private async handleChunkTimeout(chunkIndex: number) {
    const chunkInfo = this.inFlightChunks.get(chunkIndex);
    if (!chunkInfo) return;

    console.warn(`[FileWorker] Chunk ${chunkIndex} timeout (retry ${chunkInfo.retries}/${MAX_RETRIES})`);

    if (chunkInfo.retries >= MAX_RETRIES) {
      // 최대 재시도 횟수 초과
      this.metrics!.errors++;
      this.metrics!.consecutiveFailures++;
      this.inFlightChunks.delete(chunkIndex);
      throw new Error(`Failed to send chunk ${chunkIndex} after ${MAX_RETRIES} retries`);
    }

    // 재시도 카운트 증가
    chunkInfo.retries++;
    this.metrics!.consecutiveFailures++;
    
    // 저장된 데이터로 재전송
    const dataToSend = chunkInfo.data.slice(0); // 복사본 생성
    chunkInfo.sentTime = Date.now(); // 전송 시간 업데이트
    
    // 재시도 전 짧은 지연 (지수 백오프)
    const backoffDelay = Math.min(1000, 100 * Math.pow(2, chunkInfo.retries - 1));
    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    
    self.postMessage({
      type: 'chunk-ready',
      payload: {
        transferId: this.transferId,
        chunk: dataToSend,
        chunkIndex,
        isRetry: true
      }
    }, [dataToSend]);
  }

  private handleAckReceived(transferId: string, chunkIndex: number) {
    if (transferId !== this.transferId) return;

    const chunkInfo = this.inFlightChunks.get(chunkIndex);
    if (!chunkInfo) {
      console.warn(`[FileWorker] Received ACK for unknown chunk: ${chunkIndex}`);
      return;
    }

    // RTT 계산
    const rtt = Date.now() - chunkInfo.sentTime;
    this.metrics!.rttHistory.push(rtt);
    
    // 최근 20개의 RTT만 유지
    if (this.metrics!.rttHistory.length > 20) {
      this.metrics!.rttHistory.shift();
    }

    // 성공 카운터 업데이트
    this.metrics!.consecutiveSuccesses++;
    this.metrics!.consecutiveFailures = 0;

    // 청크 완료 처리
    this.inFlightChunks.delete(chunkIndex);
    this.metrics!.chunksAcked++;
    this.metrics!.bytesTransferred += calculateActualChunkSize(
      this.file!.size,
      chunkIndex,
      this.chunkSize
    );

    // Pending ACK resolver 호출
    const key = `${transferId}-${chunkIndex}`;
    const resolver = this.pendingAcks.get(key);
    if (resolver) {
      resolver();
      this.pendingAcks.delete(key);
    }

    // console.log(`[FileWorker] ACK received for chunk ${chunkIndex}, RTT: ${rtt}ms`);
  }

  private adjustWindowSize() {
    if (!this.metrics || this.metrics.rttHistory.length === 0) return;

    // 평균 RTT 계산
    const avgRtt = this.metrics.rttHistory.reduce((a, b) => a + b, 0) / this.metrics.rttHistory.length;

    // 연속 성공/실패 기반 조정
    if (this.metrics.consecutiveSuccesses > 20) {
      // 20개 이상 연속 성공: 윈도우 크기 증가
      this.metrics.currentWindowSize = Math.min(
        this.metrics.currentWindowSize + 2,
        MAX_WINDOW_SIZE
      );
      this.metrics.consecutiveSuccesses = 0;
    } else if (this.metrics.consecutiveFailures > 3) {
      // 3개 이상 연속 실패: 윈도우 크기 감소
      this.metrics.currentWindowSize = Math.max(
        Math.floor(this.metrics.currentWindowSize * 0.7),
        MIN_WINDOW_SIZE
      );
      this.metrics.consecutiveFailures = 0;
    }

    // RTT 기반 미세 조정
    if (avgRtt < 30 && this.metrics.errors === 0) {
      // 매우 빠른 연결이고 에러가 없음: 적극적으로 증가
      this.metrics.currentWindowSize = Math.min(
        this.metrics.currentWindowSize + 3,
        MAX_WINDOW_SIZE
      );
    } else if (avgRtt < 100 && this.metrics.errors < 2) {
      // 빠른 연결: 천천히 증가
      this.metrics.currentWindowSize = Math.min(
        this.metrics.currentWindowSize + 1,
        MAX_WINDOW_SIZE
      );
    } else if (avgRtt > 300) {
      // 느린 연결: 윈도우 크기 감소
      this.metrics.currentWindowSize = Math.max(
        this.metrics.currentWindowSize - 1,
        MIN_WINDOW_SIZE
      );
    }

    // 에러율 기반 조정
    const errorRate = this.metrics.errors / Math.max(1, this.metrics.chunksAcked + this.metrics.errors);
    if (errorRate > 0.1) {
      // 10% 이상 에러: 윈도우 크기 대폭 감소
      this.metrics.currentWindowSize = Math.max(
        MIN_WINDOW_SIZE,
        Math.floor(this.metrics.currentWindowSize * 0.5)
      );
    }
  }

  private reportProgress() {
    if (!this.metrics || !this.file) return;

    const progress = this.metrics.bytesTransferred / this.file.size;
    const speed = calculateTransferSpeed(
      this.metrics.bytesTransferred,
      this.metrics.startTime
    );

    self.postMessage({
      type: 'progress-update',
      payload: {
        transferId: this.transferId,
        loaded: this.metrics.bytesTransferred,
        total: this.file.size,
        progress,
        speed,
        chunksAcked: this.metrics.chunksAcked,
        totalChunks: this.metrics.totalChunks,
        windowSize: this.metrics.currentWindowSize
      }
    });
  }

  private async sendEndSignal() {
    console.log(`[FileWorker] Sending End Signal for ${this.transferId}`);
    
    const endHeader = new ArrayBuffer(1);
    const endHeaderView = new DataView(endHeader);
    endHeaderView.setUint8(0, 2); // Type: End of File
    
    // End Signal을 3번 전송 (신뢰성 향상)
    for (let i = 0; i < 3; i++) {
      const dataToSend = endHeader.slice(0);
      self.postMessage({
        type: 'chunk-ready',
        payload: {
          transferId: this.transferId,
          chunk: dataToSend
        }
      }, [dataToSend]);
      
      // 전송 간 짧은 지연
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[FileWorker] End Signal sent 3 times for ${this.transferId}`);
  }

  private reportCompletion() {
    if (!this.metrics) return;

    const duration = Date.now() - this.metrics.startTime;
    const avgSpeed = calculateTransferSpeed(
      this.metrics.bytesTransferred,
      this.metrics.startTime
    );

    self.postMessage({
      type: 'transfer-complete',
      payload: {
        transferId: this.transferId,
        duration,
        avgSpeed,
        totalBytes: this.metrics.bytesTransferred,
        totalChunks: this.metrics.totalChunks
      }
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
    self.postMessage({
      type: 'transfer-paused',
      payload: { transferId: this.transferId }
    });
  }

  private resumeTransfer() {
    this.isPaused = false;
    self.postMessage({
      type: 'transfer-resumed',
      payload: { transferId: this.transferId }
    });
  }

  private cleanup() {
    if (this.checkTimeoutInterval) {
      clearInterval(this.checkTimeoutInterval as any);
      this.checkTimeoutInterval = null;
    }
    
    this.pendingAcks.clear();
    this.inFlightChunks.clear();
    this.metrics = null;
    this.file = null;
    this.transferId = '';
    this.isCancelled = false;
    this.isPaused = false;
    
    // 워커 종료
    self.close();
  }
}

// 워커 인스턴스 생성
new FileTransferWorker();
