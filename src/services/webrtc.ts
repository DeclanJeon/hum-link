import Peer from 'simple-peer/simplepeer.min.js';
import type { Instance as PeerInstance, SignalData } from 'simple-peer';

interface WebRTCEvents {
  onSignal: (peerId: string, signal: SignalData) => void;
  onConnect: (peerId: string) => void;
  onStream: (peerId: string, stream: MediaStream) => void;
  onData: (peerId: string, data: any) => void;
  onClose: (peerId: string) => void;
  onError: (peerId: string, error: Error) => void;
}

export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream;
  private events: WebRTCEvents;

  constructor(localStream: MediaStream, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
  }

  // ✅ 수정: initiator 플래그를 인자로 받음
  public createPeer(peerId: string, initiator: boolean): void {
    console.log(`[WebRTCManager] 피어 생성 요청 (ID: ${peerId}, Initiator: ${initiator})`);
    const peer = new Peer({
      initiator: initiator,
      stream: this.localStream,
      trickle: true,
    });

    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
  }

  // ✅ 수정: 이 함수는 이제 initiator가 false일 때만 호출됨
  public receiveSignal(peerId: string, signal: SignalData): void {
    console.log(`[WebRTCManager] Non-initiator 피어(${peerId})를 위한 시그널 수신 및 처리.`);
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
      console.log(`[WebRTCManager] 기존 피어(${peerId})에게 시그널 전달.`);
      peer.signal(signal);
    } else {
      console.warn(`[WebRTCManager] 시그널링할 피어를 찾지 못함: ${peerId}`);
    }
  }

  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      console.log(`[WebRTCManager] 피어(${peerId}) 제거.`);
      peer.destroy();
      this.peers.delete(peerId);
    }
  }
  
  public sendToAllPeers(message: any): number {
    let sentCount = 0;
    this.peers.forEach((peer, peerId) => {
      if (peer.connected) {
        try {
          peer.send(message);
          sentCount++;
        } catch (error) {
          console.error(`[WebRTCManager] 피어(${peerId})에게 데이터 전송 실패:`, error);
        }
      }
    });
    if (sentCount > 0) {
        console.log(`[WebRTCManager] ${sentCount}개의 피어에게 데이터 전송 완료.`);
    }
    return sentCount;
  }

  public replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream): void {
    console.log(`[WebRTCManager] 모든 피어의 미디어 트랙 교체: ${oldTrack.kind}`);
    this.peers.forEach(peer => {
      peer.replaceTrack(oldTrack, newTrack, stream);
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
    console.log('[WebRTCManager] 모든 피어 연결 파괴.');
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