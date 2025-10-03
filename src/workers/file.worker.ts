/// <reference lib="webworker" />
/**
 * @fileoverview      . (v2.2.2 - Quantum Handshake Calibrated)
 * @module workers/file.worker
 * @description    ,  ,  , ACK ,
 *                      .
 *              v2.2.2: 수신자의 최종 완료 신호(force-complete)를 받아
 *                      ACK를 기다리지 않고 즉시 전송을 완료하는 로직 추가.
 */

import {
  calculateTotalChunks,
  calculateFileOffset,
  calculateActualChunkSize,
} from '../lib/fileTransferUtils';

declare const self: DedicatedWorkerGlobalScope;

const TRANSFER_CONFIGS = {
  excellent: { windowSize: 32, timeout: 10000, maxRetries: 3, sendDelay: 5 },
  good:      { windowSize: 16, timeout: 15000, maxRetries: 3, sendDelay: 10 },
  moderate:  { windowSize: 8,  timeout: 20000, maxRetries: 4, sendDelay: 25 },
  poor:      { windowSize: 4,  timeout: 30000, maxRetries: 5, sendDelay: 50 },
};

interface ChunkState {
  acked: boolean;
  retries: number;
  lastSentTime: number;
  size: number;
}

class ResilientFileWorker {
  private file: File | null = null;
  private transferId: string = '';
  private chunkSize: number = 0;
  private totalChunks: number = 0;
  private chunkStates: Map<number, ChunkState> = new Map();

  private isCancelled: boolean = false;
  private isPaused: boolean = false;
  private isSendingAllowed: boolean = true;

  private networkQuality: keyof typeof TRANSFER_CONFIGS = 'moderate';
  private currentConfig = TRANSFER_CONFIGS.moderate;
  private currentWindowSize: number = 8;
  private inFlightChunks: Set<number> = new Set();
  private nextChunkToSend: number = 0;

  private startTime: number = 0;
  private bytesAcked: number = 0;
  private bytesSent: number = 0;
  private lastProgressReportTime: number = 0;
  private timeoutCheckInterval: number | null = null;

  constructor() {
      self.onmessage = this.handleMessage.bind(this);
  }

  private resetState(): void {
      this.file = null;
      this.transferId = '';
      this.chunkSize = 0;
      this.totalChunks = 0;
      this.chunkStates.clear();
      this.isCancelled = false;
      this.isPaused = false;
      this.isSendingAllowed = true;
      this.networkQuality = 'moderate';
      this.currentConfig = TRANSFER_CONFIGS.moderate;
      this.currentWindowSize = 8;
      this.inFlightChunks.clear();
      this.nextChunkToSend = 0;
      this.startTime = 0;
      this.bytesAcked = 0;
      this.bytesSent = 0;
      if (this.timeoutCheckInterval) {
          self.clearInterval(this.timeoutCheckInterval);
          this.timeoutCheckInterval = null;
      }
      console.log('[FileWorker] State has been reset for a new transfer.');
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
      const { type, payload } = event.data;
      switch (type) {
          case 'start-transfer':
              this.resetState();
              await this.startTransfer(payload.file, payload.transferId, payload.chunkSize);
              break;
          case 'ack-received':
              this.handleAckReceived(payload.chunkIndex);
              break;
          case 'set-sending-status':
              this.isSendingAllowed = payload.canSend;
              if(this.isSendingAllowed) { this.transferLoop(); }
              break;
          case 'cancel-transfer':
              this.cancelTransfer();
              break;
          case 'pause-transfer':
              this.isPaused = true;
              break;
          case 'resume-transfer':
              this.isPaused = false;
              this.transferLoop();
              break;
          // v2.2.2: 최종 완료 신호 수신
          case 'force-complete':
              console.log(`[FileWorker] Force completing transfer ${this.transferId} by main thread request.`);
              await this.completeTransfer(true);
              break;
          default:
              console.warn(`[FileWorker] Unknown message type: ${type}`);
      }
  }

  private async startTransfer(file: File, transferId: string, chunkSize: number): Promise<void> {
      this.file = file;
      this.transferId = transferId;
      this.chunkSize = chunkSize;
      this.totalChunks = calculateTotalChunks(file.size, this.chunkSize);
      this.startTime = Date.now();
      this.detectNetworkQuality();
      this.initializeChunkStates();
      console.log(`[FileWorker] Starting transfer: ${transferId}, Chunks: ${this.totalChunks}, ChunkSize: ${this.chunkSize / 1024}KB`);
      this.timeoutCheckInterval = self.setInterval(() => this.checkTimeoutsAndResend(), 1000);
      this.transferLoop();
  }

  private detectNetworkQuality(): void {
      const fileSizeMB = this.file!.size / (1024 * 1024);
      if (fileSizeMB < 10) this.networkQuality = 'good';
      else if (fileSizeMB < 100) this.networkQuality = 'moderate';
      else this.networkQuality = 'poor';
      this.currentConfig = TRANSFER_CONFIGS[this.networkQuality];
      this.currentWindowSize = this.currentConfig.windowSize;
      console.log(`[FileWorker] Network quality: ${this.networkQuality}, Window size: ${this.currentWindowSize}`);
  }
  
  private initializeChunkStates(): void {
      for (let i = 0; i < this.totalChunks; i++) {
          this.chunkStates.set(i, { acked: false, retries: 0, lastSentTime: 0, size: calculateActualChunkSize(this.file!.size, i, this.chunkSize) });
      }
  }

  private async transferLoop(): Promise<void> {
      if (this.isCancelled || this.isPaused) return;
      while (this.isSendingAllowed && this.inFlightChunks.size < this.currentWindowSize && this.nextChunkToSend < this.totalChunks) {
          const chunkIndexToSent = this.nextChunkToSend;
          this.nextChunkToSend++;
          await this.sendChunk(chunkIndexToSent);
      }
      if (this.getAckedCount() === this.totalChunks) { await this.completeTransfer(); }
  }
  
  private async sendChunk(chunkIndex: number): Promise<void> {
      if (!this.file || this.isCancelled) return;
      const state = this.chunkStates.get(chunkIndex);
      if (!state || state.acked || this.inFlightChunks.has(chunkIndex)) return;
      try {
          const offset = calculateFileOffset(chunkIndex, this.chunkSize);
          const blob = this.file.slice(offset, offset + state.size);
          const data = await blob.arrayBuffer();
          const packet = this.createChunkPacket(chunkIndex, data);
          self.postMessage({ type: 'chunk-ready', payload: { transferId: this.transferId, chunk: packet, chunkIndex } }, [packet]);
          state.lastSentTime = Date.now();
          this.inFlightChunks.add(chunkIndex);
          this.bytesSent += state.size;
      } catch (error) {
          console.error(`[FileWorker] Error preparing chunk ${chunkIndex}:`, error);
          this.inFlightChunks.delete(chunkIndex);
      }
  }
  
  private createChunkPacket(chunkIndex: number, data: ArrayBuffer): ArrayBuffer {
      const transferIdBytes = new TextEncoder().encode(this.transferId);
      const headerSize = 1 + 2 + transferIdBytes.length + 4;
      const packet = new ArrayBuffer(headerSize + data.byteLength);
      const view = new DataView(packet);
      let offset = 0;
      view.setUint8(offset, 1); offset += 1;
      view.setUint16(offset, transferIdBytes.length, false); offset += 2;
      new Uint8Array(packet, offset, transferIdBytes.length).set(transferIdBytes); offset += transferIdBytes.length;
      view.setUint32(offset, chunkIndex, false); offset += 4;
      new Uint8Array(packet, offset).set(new Uint8Array(data));
      return packet;
  }

  private handleAckReceived(chunkIndex: number): void {
      const state = this.chunkStates.get(chunkIndex);
      if (state && !state.acked) {
          state.acked = true;
          this.inFlightChunks.delete(chunkIndex);
          this.bytesAcked += state.size;
          const rtt = Date.now() - state.lastSentTime;
          this.adjustWindowOnAck(rtt);
          this.reportProgress();
          this.transferLoop();
      }
  }

  private adjustWindowOnAck(rtt: number): void {
      this.currentWindowSize = Math.min(this.currentConfig.windowSize, this.currentWindowSize + 1);
  }
  
  private checkTimeoutsAndResend(): void {
      if (this.isPaused || this.isCancelled) return;
      const now = Date.now();
      let timedOutCount = 0;
      this.inFlightChunks.forEach(chunkIndex => {
          const state = this.chunkStates.get(chunkIndex);
          if (state && now - state.lastSentTime > this.currentConfig.timeout) {
              console.warn(`[FileWorker] Chunk ${chunkIndex} timed out.`);
              timedOutCount++;
              if (state.retries < this.currentConfig.maxRetries) {
                  state.retries++;
                  this.inFlightChunks.delete(chunkIndex);
                  this.sendChunk(chunkIndex);
              } else { this.cancelTransfer(`Chunk ${chunkIndex} failed after max retries.`); }
          }
      });
      if (timedOutCount > 0) {
          this.currentWindowSize = Math.max(1, Math.floor(this.currentWindowSize / 2));
          console.log(`[FileWorker] Timeout occurred, window size reduced to ${this.currentWindowSize}`);
      }
  }

  private async completeTransfer(force: boolean = false): Promise<void> {
      if (this.isCancelled) return;
      
      // 강제 완료가 아니고, 모든 ACK를 받지 못했다면 아직 완료 아님
      if (!force && this.getAckedCount() < this.totalChunks) return;
      
      console.log(`[FileWorker] Completing transfer... (Forced: ${force})`);
      
      // END 신호 전송 (수신자가 혹시 못 받았을 경우를 대비)
      const transferIdBytes = new TextEncoder().encode(this.transferId);
      const endPacket = new ArrayBuffer(1 + 2 + transferIdBytes.length);
      const view = new DataView(endPacket);
      view.setUint8(0, 2);
      view.setUint16(1, transferIdBytes.length, false);
      new Uint8Array(endPacket, 3).set(transferIdBytes);
      for (let i = 0; i < 3; i++) {
          self.postMessage({ type: 'chunk-ready', payload: { transferId: this.transferId, chunk: endPacket.slice(0) } });
          await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 메인 스레드에 완료 신호 전송
      self.postMessage({
          type: 'transfer-complete',
          payload: {
              transferId: this.transferId,
              startTime: this.startTime,
              totalSize: this.file!.size,
          }
      });
      
      this.cleanup();
  }
  
  private reportProgress(): void {
      const now = Date.now();
      if (now - this.lastProgressReportTime < 250) return;
      this.lastProgressReportTime = now;
      self.postMessage({
          type: 'progress-update',
          payload: {
              transferId: this.transferId,
              ackedSize: this.bytesAcked,
              sentSize: this.bytesSent,
              totalSize: this.file!.size,
              ackedChunks: this.getAckedCount(),
              totalChunks: this.totalChunks,
              startTime: this.startTime,
          },
      });
  }

  private getAckedCount = (): number => Array.from(this.chunkStates.values()).filter(s => s.acked).length;

  private cancelTransfer(reason: string = "User cancelled"): void {
      if (this.isCancelled) return;
      this.isCancelled = true;
      self.postMessage({ type: 'transfer-cancelled', payload: { transferId: this.transferId, reason } });
      this.cleanup();
  }

  private cleanup(): void {
      if (this.timeoutCheckInterval) {
          self.clearInterval(this.timeoutCheckInterval);
          this.timeoutCheckInterval = null;
      }
      this.resetState();
      console.log(`[FileWorker] Worker has finished its task and is ready for the next one.`);
  }
}

new ResilientFileWorker();
