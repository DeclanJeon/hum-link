/**
 * @fileoverview WebRTC 연결 및 통신을 총괄하는 클래스
 * @module services/webrtc
 * @description simple-peer 라이브러리를 래핑하여 Peer 생성, 시그널링,
 *              데이터 채널 통신, 트랙 교체 등의 기능을 캡슐화합니다.
 */

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

/**
 * WebRTC 연결 관리를 위한 중앙 클래스
 */
export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream | null;
  private events: WebRTCEvents;
  private iceServers: RTCIceServer[] = [];

  constructor(localStream: MediaStream | null, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    console.log('[WebRTC] Manager initialized');
  }

  public updateIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers;
    console.log('[WebRTC] ICE servers updated. Total servers:', servers.length);
  }

  public createPeer(peerId: string, initiator: boolean): PeerInstance {
    if (this.peers.has(peerId)) {
      this.removePeer(peerId);
    }

    const peerConfig: any = {
      initiator,
      trickle: true,
      config: { iceServers: this.iceServers },
      offerOptions: { offerToReceiveAudio: true, offerToReceiveVideo: true },
      stream: this.localStream || false,
    };

    const peer = new Peer(peerConfig);
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);

    console.log(`[WebRTC] Peer created for ${peerId}, initiator: ${initiator}`);
    return peer;
  }

  private setupPeerEvents(peer: PeerInstance, peerId: string): void {
    peer.on('signal', (signal) => this.events.onSignal(peerId, signal));
    peer.on('connect', () => this.events.onConnect(peerId));
    peer.on('stream', (stream) => this.events.onStream(peerId, stream));
    peer.on('data', (data) => this.events.onData(peerId, data));
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.events.onError(peerId, err));
  }

  public receiveSignal(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer && !peer.destroyed) {
      peer.signal(signal);
    } else {
      console.warn(`[WebRTC] Peer not found or destroyed for signal from ${peerId}`);
    }
  }

  public async replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream): Promise<void> {
    for (const [peerId, peer] of this.peers.entries()) {
        try {
            if (peer && !peer.destroyed && typeof peer.replaceTrack === 'function') {
                await peer.replaceTrack(oldTrack, newTrack, stream);
            }
        } catch (error) {
            console.error(`[WebRTC] Failed to replace track for peer ${peerId}:`, error);
            // Fallback: renegotiation
            (peer as any)._needsNegotiation = true;
            (peer as any)._onNegotiationNeeded();
        }
    }
  }

  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (!peer.destroyed) {
        peer.destroy();
      }
      this.peers.delete(peerId);
      console.log(`[WebRTC] Peer removed: ${peerId}`);
    }
  }

  public sendToAllPeers(message: any): { successful: string[], failed: string[] } {
    const successful: string[] = [];
    const failed: string[] = [];

    for (const [peerId, peer] of this.peers.entries()) {
      if (this.sendToPeer(peerId, message)) {
        successful.push(peerId);
      } else {
        failed.push(peerId);
      }
    }
    return { successful, failed };
  }

  public sendToPeer(peerId: string, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (peer && peer.connected && !peer.destroyed) {
      try {
        peer.send(message);
        return true;
      } catch (error) {
        console.error(`[WebRTC] Failed to send to peer ${peerId}:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * 특정 피어의 데이터 채널 버퍼 크기를 반환합니다.
   * @param {string} peerId - 피어 ID
   * @returns {number | null} 버퍼 크기 (바이트) 또는 null
   */
  public getBufferedAmount(peerId: string): number | null {
    const peer = this.peers.get(peerId);
    // simple-peer 내부의 _channel에 접근
    const channel = (peer as any)?._channel;
    if (channel) {
      return channel.bufferedAmount;
    }
    return null;
  }

  public getConnectedPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, peer]) => peer.connected && !peer.destroyed)
      .map(([peerId, _]) => peerId);
  }

  public destroyAll(): void {
    for (const peer of this.peers.values()) {
      if (!peer.destroyed) {
        peer.destroy();
      }
    }
    this.peers.clear();
    console.log('[WebRTC] All peers destroyed');
  }
}
