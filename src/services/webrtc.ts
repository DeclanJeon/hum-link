/**
 * @fileoverview WebRTC 연결 관리 서비스 (재설계)
 * @module services/webrtc
 */

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
}

/**
 * 트랙 교체 결과
 */
interface TrackReplaceResult {
  success: boolean;
  peerId: string;
  error?: Error;
}

/**
 * WebRTC 매니저 클래스
 */
export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream | null;
  private events: WebRTCEvents;
  private iceServers: RTCIceServer[] = [];

  constructor(localStream: MediaStream | null, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
    
    // 기본 ICE 서버
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    console.log('[WebRTC] Manager initialized');
  }

  /**
   * ICE 서버 업데이트
   */
  public updateIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers;
    console.log('[WebRTC] ICE servers updated:', servers.length);
  }

  /**
   * 피어 생성
   */
  public createPeer(peerId: string, initiator: boolean): PeerInstance {
    if (this.peers.has(peerId)) {
      console.warn('[WebRTC] Peer already exists, removing old one');
      this.removePeer(peerId);
    }

    const peerConfig: any = {
      initiator,
      trickle: true,
      config: {
        iceServers: this.iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      },
      offerOptions: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }
    };

    // 로컬 스트림 추가
    if (this.localStream) {
      peerConfig.stream = this.localStream;
    }

    const peer = new Peer(peerConfig);
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);

    console.log('[WebRTC] Peer created:', peerId);
    return peer;
  }

  /**
   * 피어 이벤트 설정
   */
  private setupPeerEvents(peer: PeerInstance, peerId: string): void {
    peer.on('signal', (signal) => this.events.onSignal(peerId, signal));
    peer.on('connect', () => this.events.onConnect(peerId));
    peer.on('stream', (stream) => this.events.onStream(peerId, stream));
    peer.on('data', (data) => this.events.onData(peerId, data));
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.events.onError(peerId, err));
  }

  /**
   * 시그널 수신
   */
  public receiveSignal(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer && !peer.destroyed) {
      peer.signal(signal);
    }
  }

  /**
   * 로컬 스트림 업데이트 (원자적 트랙 교체)
   * 
   * @param newStream - 새 스트림
   * @returns 교체 성공 여부
   */
  public async replaceLocalStream(newStream: MediaStream): Promise<boolean> {
    console.log('[WebRTC] Replacing local stream atomically...');

    const oldStream = this.localStream;
    if (!oldStream) {
      console.log('[WebRTC] No old stream, setting new stream');
      this.localStream = newStream;
      return true;
    }

    // 1. 모든 피어에 대해 트랙 교체 시도
    const results: TrackReplaceResult[] = [];
    
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.destroyed) {
        results.push({ success: false, peerId, error: new Error('Peer destroyed') });
        continue;
      }

      try {
        // 오디오 트랙 교체
        const oldAudioTrack = oldStream.getAudioTracks()[0];
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        if (oldAudioTrack && newAudioTrack) {
          await this.replaceTrackForPeer(peer, oldAudioTrack, newAudioTrack, newStream);
          console.log(`[WebRTC] Audio track replaced for peer ${peerId}`);
        }

        // 비디오 트랙 교체
        const oldVideoTrack = oldStream.getVideoTracks()[0];
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        if (oldVideoTrack && newVideoTrack) {
          await this.replaceTrackForPeer(peer, oldVideoTrack, newVideoTrack, newStream);
          console.log(`[WebRTC] Video track replaced for peer ${peerId}`);
        }

        results.push({ success: true, peerId });
      } catch (error) {
        console.error(`[WebRTC] Failed to replace tracks for peer ${peerId}:`, error);
        results.push({ success: false, peerId, error: error as Error });
      }
    }

    // 2. 결과 분석
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('[WebRTC] Track replacement results:', {
      success: successCount,
      failed: failCount,
      total: results.length
    });

    // 3. 모든 피어에 성공했거나, 피어가 없는 경우
    if (failCount === 0 || results.length === 0) {
      // 이전 스트림 정리
      oldStream.getTracks().forEach(track => track.stop());
      
      // 새 스트림 설정
      this.localStream = newStream;
      
      console.log('[WebRTC] Local stream replaced successfully');
      return true;
    }

    // 4. 일부 실패 → 롤백 필요
    console.error('[WebRTC] Some peers failed, rolling back...');
    
    // 실패한 피어들에게 이전 트랙 복원 시도
    for (const result of results) {
      if (result.success) {
        const peer = this.peers.get(result.peerId);
        if (peer && !peer.destroyed) {
          try {
            // 롤백 로직
            const newAudioTrack = newStream.getAudioTracks()[0];
            const oldAudioTrack = oldStream.getAudioTracks()[0];
            if (newAudioTrack && oldAudioTrack) {
              await this.replaceTrackForPeer(peer, newAudioTrack, oldAudioTrack, oldStream);
            }

            const newVideoTrack = newStream.getVideoTracks()[0];
            const oldVideoTrack = oldStream.getVideoTracks()[0];
            if (newVideoTrack && oldVideoTrack) {
              await this.replaceTrackForPeer(peer, newVideoTrack, oldVideoTrack, oldStream);
            }

            console.log(`[WebRTC] Rolled back peer ${result.peerId}`);
          } catch (rollbackError) {
            console.error(`[WebRTC] Rollback failed for peer ${result.peerId}:`, rollbackError);
          }
        }
      }
    }

    // 새 스트림 정리 (사용하지 않으므로)
    newStream.getTracks().forEach(track => track.stop());

    return false;
  }

  /**
   * 단일 피어에 대한 트랙 교체
   */
  private async replaceTrackForPeer(
    peer: PeerInstance,
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack,
    newStream: MediaStream
  ): Promise<void> {
    // Simple-Peer의 replaceTrack 메서드 사용
    await peer.replaceTrack(oldTrack, newTrack, newStream);

    // Renegotiation 트리거
    await this.triggerRenegotiation(peer);
  }

  /**
   * Renegotiation 트리거
   */
  private async triggerRenegotiation(peer: PeerInstance): Promise<void> {
    const pc = (peer as any)._pc as RTCPeerConnection;
    if (!pc) return;

    // Signaling state가 stable일 때까지 대기
    if (pc.signalingState !== 'stable') {
      await this.waitForStableState(pc);
    }

    // Simple-Peer 내부 renegotiation 플래그 설정
    (peer as any)._needsNegotiation = true;
    
    // Negotiation 이벤트 핸들러 호출
    if (typeof (peer as any)._onNegotiationNeeded === 'function') {
      (peer as any)._onNegotiationNeeded();
    }
  }

  /**
   * Stable state 대기
   */
  private async waitForStableState(pc: RTCPeerConnection, timeout: number = 3000): Promise<void> {
    const startTime = Date.now();
    
    while (pc.signalingState !== 'stable') {
      if (Date.now() - startTime > timeout) {
        console.warn('[WebRTC] Stable state timeout');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 피어 제거
   */
  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (!peer.destroyed) {
        peer.destroy();
      }
      this.peers.delete(peerId);
      console.log('[WebRTC] Peer removed:', peerId);
    }
  }

  /**
   * 모든 피어에게 메시지 전송
   */
  public sendToAllPeers(message: any): { successful: string[], failed: string[] } {
    const successful: string[] = [];
    const failed: string[] = [];

    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.connected && !peer.destroyed) {
        try {
          peer.send(message);
          successful.push(peerId);
        } catch (error) {
          console.error(`[WebRTC] Failed to send to peer ${peerId}:`, error);
          failed.push(peerId);
        }
      } else {
        failed.push(peerId);
      }
    }

    return { successful, failed };
  }

  /**
   * 특정 피어에게 메시지 전송
   */
  public sendToPeer(peerId: string, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected || peer.destroyed) {
      return false;
    }

    try {
      peer.send(message);
      return true;
    } catch (error) {
      console.error(`[WebRTC] Failed to send to peer ${peerId}:`, error);
      return false;
    }
  }

  /**
   * 연결된 피어 ID 목록
   */
  public getConnectedPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, peer]) => peer.connected && !peer.destroyed)
      .map(([peerId, _]) => peerId);
  }

  /**
   * 정리
   */
  public destroyAll(): void {
    for (const [peerId, peer] of this.peers.entries()) {
      if (!peer.destroyed) {
        peer.destroy();
      }
    }
    this.peers.clear();
    console.log('[WebRTC] All peers destroyed');
  }
}
