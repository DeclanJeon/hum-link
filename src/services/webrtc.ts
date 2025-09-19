// @types/simple-peer를 설치하여 타입 안정성을 확보합니다.
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
 * WebRTCManager: simple-peer를 래핑하여 Peer Connection 관리를 추상화합니다.
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
      // 피어를 찾지 못했을 때 새 피어를 생성하는 대신 경고를 남깁니다.
      // 신호 교환 로직은 상위 스토어에서 명확히 관리해야 합니다.
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
  
  public sendToAllPeers(message: any): number {
    let sentCount = 0;
    this.peers.forEach((peer) => {
      if (peer.connected) {
        peer.send(message);
        sentCount++;
      }
    });
    return sentCount;
  }

  /**
   * 스트림의 특정 트랙(오디오 또는 비디오)을 교체합니다.
   * 화면 공유나 장치 변경 시 연결을 끊지 않고 스트림을 전환하는 데 사용됩니다.
   * @param oldTrack 교체될 기존 트랙
   * @param newTrack 새로 적용될 트랙
   */
  public replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): void {
    this.peers.forEach(peer => {
      peer.replaceTrack(oldTrack, newTrack, this.localStream);
    });
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
    peer.on('data', (data) => this.events.onData(peerId, data));
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.events.onError(peerId, err));
  }
}
