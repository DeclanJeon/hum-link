import Peer from 'simple-peer/simplepeer.min.js';
import type { Instance as PeerInstance, SignalData } from 'simple-peer';

// WebRTC 이벤트 인터페이스
interface WebRTCEvents {
  onSignal: (peerId: string, signal: SignalData) => void;
  onConnect: (peerId: string) => void;
  onStream: (peerId: string, stream: MediaStream) => void;
  onData: (peerId: string, data: any) => void;
  onClose: (peerId: string) => void;
  onError: (peerId: string, error: Error) => void;
}

/**
 * WebRTCManager: simple-peer를 래핑하여 Peer Connection을 관리합니다.
 */
export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream;
  private events: WebRTCEvents;

  constructor(localStream: MediaStream, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
  }

  public createPeer(peerId: string): void {
    console.log('[WebRTCManager] Creating peer (initiator)', { peerId });
    const peer = new Peer({
      initiator: true,
      stream: this.localStream,
      trickle: true,
    });

    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
  }

  public receiveSignal(peerId: string, signal: SignalData): void {
    console.log('[WebRTCManager] Receiving signal for non-initiator peer', { peerId });
    const peer = new Peer({
      initiator: false,
      stream: this.localStream,
      trickle: true,
    });
    peer.signal(signal);
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
  }

  public signalPeer(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      console.log('[WebRTCManager] Signaling existing peer', { peerId });
      peer.signal(signal);
    } else {
      console.warn(`[WebRTCManager] Peer not found for signaling: ${peerId}`);
    }
  }

  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      console.log('[WebRTCManager] Removing peer', { peerId });
      peer.destroy();
      this.peers.delete(peerId);
    }
  }
  
  /**
   * 연결된 모든 피어에게 데이터 채널을 통해 메시지를 전송합니다.
   * @param message 전송할 문자열 데이터 (JSON.stringify 필요)
   * @returns 메시지를 성공적으로 보낸 피어의 수
   */
  public sendToAllPeers(message: any): number {
    let sentCount = 0;
    this.peers.forEach((peer) => {
      if (peer.connected) {
        // simple-peer는 JSON.stringify 없이도 ArrayBuffer를 보낼 수 있습니다.
        // 문자열이 아니면 그대로 보냅니다.
        const dataToSend = typeof message === 'string' ? message : message;
        peer.send(dataToSend);
        sentCount++;
      }
    });
    return sentCount;
  }

  public async replaceTrack(newTrack: MediaStreamTrack): Promise<void> {
    // ... (기존과 동일)
  }
  
  public getConnectedPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([, peer]) => peer.connected)
      .map(([peerId]) => peerId);
  }

  public hasPeer(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  public destroyAll(): void {
    this.peers.forEach(peer => peer.destroy());
    this.peers.clear();
  }

  private setupPeerEvents(peer: PeerInstance, peerId: string): void {
    peer.on('signal', (signal) => this.events.onSignal(peerId, signal));
    peer.on('connect', () => this.events.onConnect(peerId));
    peer.on('stream', (stream) => this.events.onStream(peerId, stream));
    peer.on('data', (data) => {
      // ✅ 이제 onData는 받은 데이터를 그대로 상위 스토어로 전달합니다.
      // 파싱 로직은 useWebRTCStore에서 담당합니다.
      this.events.onData(peerId, data);
    });
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.events.onError(peerId, err));
  }
}
