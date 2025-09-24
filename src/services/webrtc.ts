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

  public createPeer(peerId: string, initiator: boolean): PeerInstance {
    const peer = new Peer({
      initiator: initiator,
      stream: this.localStream,
      trickle: true,
      destroyOnSignalError: false, // 1. 에러 발생 시 자동 파괴 방지
    });
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    return peer;
  }

  public receiveSignal(peerId: string, signal: SignalData): void {
    const peer = this.createPeer(peerId, false);
    peer.signal(signal);
  }

  public signalPeer(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer) peer.signal(signal);
  }

  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.destroy();
      this.peers.delete(peerId);
    }
  }
  
  public sendToAllPeers(message: any): { successful: string[], failed: string[] } {
    const successful: string[] = [];
    const failed: string[] = [];
    this.peers.forEach((peer, peerId) => {
      if (peer.connected && !peer.destroyed) {
        try {
          peer.send(message);
          successful.push(peerId);
        } catch (error) {
          // 2. 가장 낮은 레벨에서 에러를 잡고, 실패 목록에 추가
          console.warn(`[WebRTCManager] Failed to send data to peer (${peerId}):`, error);
          failed.push(peerId);
        }
      }
    });
    return { successful, failed };
  }

  public replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach(peer => {
      if (!peer.destroyed) peer.replaceTrack(oldTrack, newTrack, stream);
    });
  }
  
  public getConnectedPeerIds(): string[] {
    return Array.from(this.peers.keys()).filter(peerId => this.peers.get(peerId)?.connected && !this.peers.get(peerId)?.destroyed);
  }

  public getPeerDataChannelBuffer(peerId: string): number {
    const peer = this.peers.get(peerId);
    if (peer && (peer as any)._channel && !peer.destroyed) {
      return (peer as any)._channel.bufferedAmount || 0;
    }
    return 0;
  }

  public hasPeer(peerId: string): boolean {
    return this.peers.has(peerId) && !this.peers.get(peerId)?.destroyed;
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