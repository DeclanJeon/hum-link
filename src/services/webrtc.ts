import Peer from 'simple-peer/simplepeer.min.js';
import type { Instance as PeerInstance, SignalData } from 'simple-peer';

interface WebRTCEvents {
  onSignal: (peerId: string, signal: SignalData) => void;
  onConnect: (peerId: string) => void;
  onStream: (peerId: string, stream: MediaStream) => void;
  onData: (peerId: string, data: any) => void;
  onClose: (peerId: string) => void;
  onError: (peerId: string, error: Error) => void;
  onBufferLow?: (peerId: string) => void;
}

// DataChannel 설정
const DATACHANNEL_CONFIG = {
  ordered: true,
  maxRetransmits: 30,
  maxPacketLifeTime: undefined,
  protocol: '',
  negotiated: false,
  id: undefined
};

// 버퍼 관리 상수 (바이트)
const BUFFER_HIGH_THRESHOLD = 4 * 1024 * 1024; // 4MB - 버퍼 상한선
const BUFFER_LOW_THRESHOLD = 512 * 1024;  // 512KB - 버퍼 하한선
const BUFFER_CHECK_INTERVAL = 50; // 50ms 간격

export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream;
  private events: WebRTCEvents;
  private connectionRetries: Map<string, number> = new Map();
  private readonly MAX_RETRIES = 3;

  constructor(localStream: MediaStream, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
  }

  public createPeer(peerId: string, initiator: boolean): PeerInstance {
    // 기존 peer 정리
    if (this.peers.has(peerId)) {
      this.removePeer(peerId);
    }

    const peer = new Peer({
      initiator: initiator,
      stream: this.localStream,
      trickle: true,
      channelConfig: DATACHANNEL_CONFIG,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      }
    });
    
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    this.connectionRetries.set(peerId, 0);
    
    // 연결 시 버퍼 설정
    peer.on('connect', () => {
      this.setupDataChannelBuffer(peer, peerId);
      this.connectionRetries.set(peerId, 0);
    });
    
    return peer;
  }

  private setupDataChannelBuffer(peer: PeerInstance, peerId: string) {
    const channel = (peer as any)._channel;
    if (!channel) return;

    // 버퍼 임계값 설정
    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
    
    // 버퍼 낮음 이벤트
    channel.onbufferedamountlow = () => {
      this.events.onBufferLow?.(peerId);
    };

    console.log(`[WebRTC] DataChannel buffer configured for peer ${peerId}`);
  }

  public async sendWithFlowControl(
    peerId: string,
    data: ArrayBuffer | Uint8Array,
    timeout: number = 30000
  ): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected || peer.destroyed) {
      return false;
    }
  
    const channel = (peer as any)._channel;
    if (!channel || channel.readyState !== 'open') {
      return false;
    }
  
    const startTime = Date.now();
    const MAX_BUFFER = 256 * 1024; // 256KB 버퍼 제한
    
    // 버퍼가 가득 찰 때까지 대기
    while (channel.bufferedAmount > MAX_BUFFER) {
      if (Date.now() - startTime > timeout) {
        console.warn(`[WebRTC] Send timeout for peer ${peerId}, buffer full`);
        return false;
      }
      
      if (!peer.connected || peer.destroyed || channel.readyState !== 'open') {
        return false;
      }
      
      // 더 긴 대기
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  
    try {
      peer.send(data);
      return true;
    } catch (error: any) {
      if (error.message?.includes('queue is full')) {
        console.warn(`[WebRTC] Queue full for peer ${peerId}, will retry`);
        return false;
      }
      console.warn(`[WebRTC] Failed to send to peer ${peerId}:`, error);
      return false;
    }
  }

  // 특정 피어에게 메시지 전송 (신규 메서드)
  public sendToPeer(peerId: string, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected || peer.destroyed) {
      console.warn(`[WebRTC] Cannot send to peer ${peerId}: not connected`);
      return false;
    }

    try {
      const channel = (peer as any)._channel;
      if (!channel || channel.readyState !== 'open') {
        console.warn(`[WebRTC] Cannot send to peer ${peerId}: channel not open`);
        return false;
      }

      peer.send(message);
      return true;
    } catch (error) {
      console.error(`[WebRTC] Failed to send to peer ${peerId}:`, error);
      return false;
    }
  }

  public receiveSignal(peerId: string, signal: SignalData): void {
    const existingPeer = this.peers.get(peerId);
    if (existingPeer && !existingPeer.destroyed) {
      existingPeer.signal(signal);
    } else {
      const peer = this.createPeer(peerId, false);
      peer.signal(signal);
    }
  }

  public signalPeer(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer && !peer.destroyed) {
      try {
        peer.signal(signal);
      } catch (error) {
        console.error(`[WebRTC] Failed to signal peer ${peerId}:`, error);
      }
    }
  }

  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        if (!peer.destroyed) {
          peer.destroy();
        }
      } catch (error) {
        console.warn(`[WebRTC] Error destroying peer ${peerId}:`, error);
      }
      this.peers.delete(peerId);
    }
    
    this.connectionRetries.delete(peerId);
  }
  
  public sendToAllPeers(message: any): { successful: string[], failed: string[] } {
    const successful: string[] = [];
    const failed: string[] = [];
    
    this.peers.forEach((peer, peerId) => {
      if (peer.connected && !peer.destroyed) {
        try {
          const channel = (peer as any)._channel;
          if (!channel || channel.readyState !== 'open') {
            failed.push(peerId);
            return;
          }

          // 대용량 데이터 처리
          if (message instanceof ArrayBuffer && message.byteLength > BUFFER_HIGH_THRESHOLD) {
            // 비동기 flow control 사용
            this.sendWithFlowControl(peerId, message).then(success => {
              if (!success) {
                console.warn(`[WebRTC] Flow control send failed for peer ${peerId}`);
              }
            });
          } else {
            peer.send(message);
          }
          successful.push(peerId);
        } catch (error) {
          console.warn(`[WebRTC] Failed to send data to peer (${peerId}):`, error);
          failed.push(peerId);
        }
      } else {
        failed.push(peerId);
      }
    });
    
    return { successful, failed };
  }

  public replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.replaceTrack(oldTrack, newTrack, stream);
        } catch (error) {
          console.error(`[WebRTC] Failed to replace track for peer ${peerId}:`, error);
        }
      }
    });
  }
  
  public getConnectedPeerIds(): string[] {
    return Array.from(this.peers.keys()).filter(peerId => {
      const peer = this.peers.get(peerId);
      return peer?.connected && !peer?.destroyed;
    });
  }

  public getPeerDataChannelBuffer(peerId: string): number {
    const peer = this.peers.get(peerId);
    if (peer && (peer as any)._channel && !peer.destroyed) {
      const channel = (peer as any)._channel;
      if (channel.readyState === 'open') {
        return channel.bufferedAmount || 0;
      }
    }
    return 0;
  }

  public hasPeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer ? !peer.destroyed : false;
  }

  public isPeerConnected(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer ? peer.connected && !peer.destroyed : false;
  }

  public destroyAll(): void {
    this.peers.forEach((peer, peerId) => {
      try {
        if (!peer.destroyed) {
          peer.destroy();
        }
      } catch (error) {
        console.warn(`[WebRTC] Error destroying peer ${peerId}:`, error);
      }
    });
    this.peers.clear();
    this.connectionRetries.clear();
  }

  private setupPeerEvents(peer: PeerInstance, peerId: string): void {
    peer.on('signal', (signal) => this.events.onSignal(peerId, signal));
    peer.on('connect', () => this.events.onConnect(peerId));
    peer.on('stream', (stream) => this.events.onStream(peerId, stream));
    peer.on('data', (data) => this.events.onData(peerId, data));
    peer.on('close', () => this.events.onClose(peerId)); 
    peer.on('error', (err) => this.handlePeerError(peerId, err));
  }

  private handlePeerError(peerId: string, error: Error): void {
    // OperationError는 일반적으로 무시
    if (error.name === 'OperationError') {
      console.warn(`[WebRTC] Non-fatal OperationError on peer (${peerId}). Flow control will handle it. Error: ${error.message}`);
      return;
    }

    // 재시도 로직
    const retries = this.connectionRetries.get(peerId) || 0;
    if (retries < this.MAX_RETRIES) {
      console.warn(`[WebRTC] Error on peer ${peerId}, retry ${retries + 1}/${this.MAX_RETRIES}:`, error.message);
      this.connectionRetries.set(peerId, retries + 1);
      // 재연결 로직은 상위 레이어에서 처리
    } else {
      console.error(`[WebRTC] Unrecoverable fatal error on peer (${peerId}), removing peer:`, error);
      this.events.onError(peerId, error);
    }
  }
}