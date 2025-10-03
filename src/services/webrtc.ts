/**
 * @fileoverview WebRTC     
 * @module services/webrtc
 * @description simple-peer   Peer , ,
 *                ,     .
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
 * WebRTC     
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
            (peer as any)._needsNegotiation = true;
            (peer as any)._onNegotiationNeeded();
        }
    }
  }

  public async replaceLocalStream(newStream: MediaStream): Promise<boolean> {
    this.localStream = newStream;
    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];
    let success = true;

    for (const [peerId, peer] of this.peers.entries()) {
      if (peer && !peer.destroyed) {
        try {
          const oldVideoSender = peer.streams[0]?.getVideoTracks()[0];
          const oldAudioSender = peer.streams[0]?.getAudioTracks()[0];

          if (oldVideoSender && newVideoTrack) {
            await peer.replaceTrack(oldVideoSender, newVideoTrack, newStream);
          } else if (newVideoTrack) {
            peer.addTrack(newVideoTrack, newStream);
          }

          if (oldAudioSender && newAudioTrack) {
            await peer.replaceTrack(oldAudioSender, newAudioTrack, newStream);
          } else if (newAudioTrack) {
            peer.addTrack(newAudioTrack, newStream);
          }
        } catch (error) {
          console.error(`[WebRTC] Failed to replace stream for peer ${peerId}:`, error);
          success = false;
        }
      }
    }
    return success;
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

  public getBufferedAmount(peerId: string): number | null {
    const peer = this.peers.get(peerId);
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
