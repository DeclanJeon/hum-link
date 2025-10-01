// src/services/webrtc.ts
import Peer from 'simple-peer/simplepeer.min.js';
import type { Instance as PeerInstance, SignalData } from 'simple-peer';
import { useSignalingStore } from '@/stores/useSignalingStore';

interface WebRTCEvents {
  onSignal: (peerId: string, signal: SignalData) => void;
  onConnect: (peerId: string) => void;
  onStream: (peerId: string, stream: MediaStream) => void;
  onData: (peerId: string, data: any) => void;
  onClose: (peerId: string) => void;
  onError: (peerId: string, error: Error) => void;
  onBufferLow?: (peerId: string) => void;
}

const DATACHANNEL_CONFIG = {
  ordered: true,
  maxRetransmits: 30,
  maxPacketLifeTime: undefined,
  protocol: '',
  negotiated: false,
  id: undefined
};

const BUFFER_HIGH_THRESHOLD = 4 * 1024 * 1024;
const BUFFER_LOW_THRESHOLD = 512 * 1024;

export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream | null;
  private events: WebRTCEvents;
  private connectionRetries: Map<string, number> = new Map();
  private streamBackup: Map<string, MediaStream> = new Map();
  private readonly MAX_RETRIES = 3;

  constructor(localStream: MediaStream | null, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
  }

  private iceServers: RTCIceServer[] = [
    // 기본 STUN 서버만 (TURN은 동적으로 받음)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // 폴백 TURN 서버 추가
    {
      urls: 'turn:turn.peerterra.com:3478',
      username: 'kron_turn',
      credential: 'kron1234'
    }
  ];
  
  /**
   * ICE 서버 동적 업데이트
   */
  public updateIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers;
    console.log('[WebRTC] ICE 서버 업데이트 (TURN 포함)');
    
    // 디버그: TURN 서버 확인
    const turnServers = servers.filter(s => 
      s.urls.toString().includes('turn')
    );
    console.log(`[WebRTC] TURN 서버 ${turnServers.length}개 구성됨`);
  }

  public createPeer(peerId: string, initiator: boolean): PeerInstance {

    const { iceServers } = useSignalingStore.getState();

    if (this.peers.has(peerId)) {
      this.removePeer(peerId);
    }

    const peerConfig: any = {
      initiator: initiator,
      trickle: true,
      channelConfig: DATACHANNEL_CONFIG,
      config: {
        iceServers: iceServers || this.iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all', // 'relay'로 설정하면 TURN만 사용
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      },
      offerOptions: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }
    };

    console.log(`[WebRTC] Peer ${peerId} 생성 (ICE 서버: ${peerConfig.config.iceServers.length}개)`);

    if (this.localStream && this.localStream.getTracks().length > 0) {
      peerConfig.stream = this.localStream;
    }

    const peer = new Peer(peerConfig);
    
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    this.connectionRetries.set(peerId, 0);
    
    peer.on('connect', () => {
      this.setupDataChannelBuffer(peer, peerId);
      this.connectionRetries.set(peerId, 0);
      console.log(`[WebRTC] Peer ${peerId} connected`);
    });
    
    return peer;
  }

  private setupDataChannelBuffer(peer: PeerInstance, peerId: string) {
    const channel = (peer as any)._channel;
    if (!channel) return;

    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
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
    const MAX_BUFFER = 256 * 1024;
    
    while (channel.bufferedAmount > MAX_BUFFER) {
      if (Date.now() - startTime > timeout) {
        console.warn(`[WebRTC] Send timeout for peer ${peerId}, buffer full`);
        return false;
      }
      
      if (!peer.connected || peer.destroyed || channel.readyState !== 'open') {
        return false;
      }
      
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
    this.streamBackup.delete(peerId);
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

          if (message instanceof ArrayBuffer && message.byteLength > BUFFER_HIGH_THRESHOLD) {
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

  /**
   * 모든 피어에 대해 트랙 교체 (동기적)
   */
  public async replaceTrack(
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack,
    stream: MediaStream
  ): Promise<void> {
    const results: Array<{ peerId: string; success: boolean; error?: Error }> = [];
    
    // 모든 피어에 대해 순차적으로 트랙 교체
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.destroyed) {
        console.warn(`[WebRTC] Peer ${peerId} is destroyed, skipping`);
        continue;
      }
      
      try {
        // Simple-peer의 replaceTrack 메서드 사용
        await peer.replaceTrack(oldTrack, newTrack, stream);
        
        console.log(`[WebRTC] Track replaced successfully for peer ${peerId}`);
        results.push({ peerId, success: true });
        
      } catch (error) {
        console.error(`[WebRTC] Failed to replace track for peer ${peerId}:`, error);
        
        // Fallback: removeTrack + addTrack
        try {
          await peer.removeTrack(oldTrack, stream);
          await peer.addTrack(newTrack, stream);
          
          console.log(`[WebRTC] Track replaced using fallback for peer ${peerId}`);
          results.push({ peerId, success: true });
          
        } catch (fallbackError) {
          console.error(`[WebRTC] Fallback also failed for peer ${peerId}:`, fallbackError);
          results.push({
            peerId,
            success: false,
            error: fallbackError as Error
          });
        }
      }
    }
    
    // 결과 요약
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(
      `[WebRTC] Track replacement complete: ${successful} succeeded, ${failed} failed`
    );
    
    if (failed > 0) {
      throw new Error(
        `Track replacement failed for ${failed} peer(s): ${
          results.filter(r => !r.success).map(r => r.peerId).join(', ')
        }`
      );
    }
  }

  /**
   * 트랙 추가 메서드
   */
  public addTrackToAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.addTrack(track, stream);
          console.log(`[WebRTC] Track added to peer ${peerId}`);
        } catch (error) {
          console.error(`[WebRTC] Failed to add track to peer ${peerId}:`, error);
        }
      }
    });
  }

  /**
   * 트랙 제거 메서드
   */
  public removeTrackFromAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.removeTrack(track, stream);
          console.log(`[WebRTC] Track removed from peer ${peerId}`);
        } catch (error) {
          console.error(`[WebRTC] Failed to remove track from peer ${peerId}:`, error);
        }
      }
    });
  }

  public updateLocalStream(newStream: MediaStream | null): void {
    // 이전 스트림 백업
    if (this.localStream) {
      this.streamBackup.set('previous', this.localStream);
    }
    
    this.localStream = newStream;
    
    // 모든 피어에 새 스트림 적용
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          if (newStream) {
            (peer as any).addStream?.(newStream);
          }
          console.log(`[WebRTC] Updated stream for peer ${peerId}`);
        } catch (error) {
          console.error(`[WebRTC] Failed to update stream for peer ${peerId}:`, error);
        }
      }
    });
  }

  /**
   * 이전 스트림 복원
   */
  public restorePreviousStream(): MediaStream | null {
    const previousStream = this.streamBackup.get('previous');
    if (previousStream) {
      this.updateLocalStream(previousStream);
      return previousStream;
    }
    return null;
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
    this.streamBackup.clear();
  }

  private setupPeerEvents(peer: PeerInstance, peerId: string): void {
    peer.on('signal', (signal) => this.events.onSignal(peerId, signal));
    peer.on('connect', () => this.events.onConnect(peerId));
    peer.on('stream', (stream) => {
      console.log(`[WebRTC] Received stream from peer ${peerId}`);
      
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      if (videoTracks.length > 0) {
        console.log(`[WebRTC] Stream contains ${videoTracks.length} video track(s)`);
        if (videoTracks[0].label.includes('captureStream')) {
          console.log(`[WebRTC] Detected file streaming from peer ${peerId}`);
        }
      }
      
      if (audioTracks.length > 0) {
        console.log(`[WebRTC] Stream contains ${audioTracks.length} audio track(s)`);
      }
      
      this.events.onStream(peerId, stream);
    });
    peer.on('data', (data) => this.events.onData(peerId, data));
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.handlePeerError(peerId, err));
  }

  private handlePeerError(peerId: string, error: Error): void {
    if (error.name === 'OperationError') {
      console.warn(`[WebRTC] Non-fatal OperationError on peer (${peerId}). Flow control will handle it.`);
      return;
    }

    const retries = this.connectionRetries.get(peerId) || 0;
    if (retries < this.MAX_RETRIES) {
      console.warn(`[WebRTC] Error on peer ${peerId}, retry ${retries + 1}/${this.MAX_RETRIES}:`, error.message);
      this.connectionRetries.set(peerId, retries + 1);
    } else {
      console.error(`[WebRTC] Unrecoverable fatal error on peer (${peerId}), removing peer:`, error);
      this.events.onError(peerId, error);
    }
  }
}