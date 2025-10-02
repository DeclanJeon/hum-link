/**
 * @fileoverview WebRTC 연결 관리 서비스
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

const BUFFER_HIGH_THRESHOLD = 4 * 1024 * 1024; // 4MB
const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB
const MAX_RETRIES = 3;

/**
 * WebRTC Peer 연결 관리 클래스
 * Single Source of Truth 원칙을 준수하여 localStream을 관리
 */
export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream | null;
  private events: WebRTCEvents;
  private connectionRetries: Map<string, number> = new Map();
  private streamBackup: Map<string, MediaStream> = new Map();
  private readonly MAX_RETRIES = MAX_RETRIES;
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:turn.peerterra.com:3478',
      username: 'kron_turn',
      credential: 'kron1234'
    }
  ];

  constructor(localStream: MediaStream | null, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
    
    console.log('[WebRTC] Manager initialized with stream:', {
      hasStream: !!localStream,
      videoTracks: localStream?.getVideoTracks().length || 0,
      audioTracks: localStream?.getAudioTracks().length || 0,
      streamId: localStream?.id
    });
  }

  /**
   * ICE 서버 업데이트 (TURN 서버 크레덴셜 포함)
   */
  public updateIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers;
    console.log('[WebRTC] ICE 서버 업데이트 완료 (TURN 포함)');
    
    const turnServers = servers.filter(s => 
      s.urls.toString().includes('turn')
    );
    console.log(`[WebRTC] TURN 서버 ${turnServers.length}개 등록됨`);
  }

  /**
   * 로컬 스트림 업데이트
   * 모든 Peer에게 새로운 스트림을 전파
   */
  public updateLocalStream(newStream: MediaStream | null): void {
    if (this.localStream) {
      this.streamBackup.set('previous', this.localStream);
    }
    
    this.localStream = newStream;
    
    console.log('[WebRTC] 로컬 스트림 업데이트:', {
      streamId: newStream?.id,
      videoTracks: newStream?.getVideoTracks().length || 0,
      audioTracks: newStream?.getAudioTracks().length || 0
    });
  }

  /**
   * 로컬 스트림 참조 반환 (외부에서 직접 접근용)
   */
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * 트랙 교체 (개선된 버전)
   * 1. WebRTCManager의 localStream에서 먼저 트랙 교체
   * 2. 모든 Peer에 대해 replaceTrack 호출
   * 3. Renegotiation 트리거
   */
  public async replaceTrack(
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): Promise<void> {
    const results: Array<{ peerId: string; success: boolean; error?: Error }> = [];
    
    console.log(`[WebRTC] 트랙 교체 시작`);
    console.log(`[WebRTC] 이전 트랙: ${oldTrack.label} (${oldTrack.kind})`);
    console.log(`[WebRTC] 새 트랙: ${newTrack.label} (${newTrack.kind})`);
    console.log(`[WebRTC] 연결된 Peer 수: ${this.peers.size}`);
    
    // 1. WebRTCManager의 localStream에서 트랙 교체
    if (this.localStream) {
      console.log(`[WebRTC] WebRTCManager localStream에서 트랙 교체 중...`);
      
      const existingOldTrack = this.localStream.getTracks().find(
        t => t.id === oldTrack.id
      );
      
      if (existingOldTrack) {
        this.localStream.removeTrack(existingOldTrack);
        console.log(`[WebRTC] 이전 트랙 제거됨: ${existingOldTrack.id}`);
      }
      
      this.localStream.addTrack(newTrack);
      console.log(`[WebRTC] 새 트랙 추가됨: ${newTrack.id}`);
      console.log(`[WebRTC] 현재 localStream ID: ${this.localStream.id}`);
    } else {
      console.warn('[WebRTC] localStream이 없어 트랙 교체를 건너뜁니다.');
      return;
    }
    
    // 2. Peer가 없으면 여기서 종료
    if (this.peers.size === 0) {
      console.log('[WebRTC] 연결된 Peer가 없어 트랙 교체 완료');
      return;
    }
    
    // 3. 모든 Peer에 대해 트랙 교체
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.destroyed) {
        console.warn(`[WebRTC] Peer ${peerId}가 이미 파괴됨, 건너뜀`);
        results.push({ peerId, success: false, error: new Error('Peer destroyed') });
        continue;
      }
      
      try {
        console.log(`[WebRTC] Peer ${peerId}에 트랙 교체 중...`);
        
        // simple-peer의 replaceTrack은 내부적으로 RTCRtpSender.replaceTrack 사용
        await peer.replaceTrack(oldTrack, newTrack, this.localStream!);
        
        console.log(`[WebRTC] Peer ${peerId} 트랙 교체 성공`);
        results.push({ peerId, success: true });
        
        // Renegotiation 트리거 (명시적)
        const pc = (peer as any)._pc as RTCPeerConnection;
        if (pc) {
          // negotiationneeded 이벤트 강제 트리거
          pc.dispatchEvent(new Event('negotiationneeded'));
          console.log(`[WebRTC] Peer ${peerId} Renegotiation 트리거됨`);
        }
        
        // 트랙 교체 후 안정화 대기
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[WebRTC] Peer ${peerId} 트랙 교체 실패:`, error);
        
        // Fallback: addTrack + removeTrack 순서로 시도 (트랙 없는 순간 방지)
        try {
          console.log(`[WebRTC] Peer ${peerId} Fallback 시도 (addTrack + removeTrack)...`);
          
          // 먼저 새 트랙 추가
          await peer.addTrack(newTrack, this.localStream!);
          console.log(`[WebRTC] Peer ${peerId} 새 트랙 추가 완료`);
          
          // 그 다음 이전 트랙 제거
          await peer.removeTrack(oldTrack, this.localStream!);
          console.log(`[WebRTC] Peer ${peerId} 이전 트랙 제거 완료`);
          
          console.log(`[WebRTC] Peer ${peerId} Fallback 성공`);
          results.push({ peerId, success: true });
          
        } catch (fallbackError) {
          console.error(`[WebRTC] Peer ${peerId} Fallback 실패:`, fallbackError);
          results.push({
            peerId,
            success: false,
            error: fallbackError as Error
          });
        }
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`[WebRTC] 트랙 교체 완료: ${successful}개 성공, ${failed}개 실패`);
    
    if (failed > 0) {
      const failedPeers = results.filter(r => !r.success).map(r => r.peerId).join(', ');
      console.error(`[WebRTC] 실패한 Peer 목록: ${failedPeers}`);
      
      throw new Error(
        `${failed}개 Peer에서 트랙 교체 실패: ${failedPeers}`
      );
    }
  }

  /**
   * Peer 생성
   */
  public createPeer(peerId: string, initiator: boolean): PeerInstance {
    const { iceServers } = useSignalingStore.getState();

    if (this.peers.has(peerId)) {
      console.log(`[WebRTC] Peer ${peerId} 이미 존재, 재생성`);
      this.removePeer(peerId);
    }

    const peerConfig: any = {
      initiator: initiator,
      trickle: true,
      channelConfig: DATACHANNEL_CONFIG,
      config: {
        iceServers: iceServers || this.iceServers,
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

    console.log(`[WebRTC] Peer ${peerId} 생성 중 (ICE 서버: ${peerConfig.config.iceServers.length}개)`);

    if (this.localStream && this.localStream.getTracks().length > 0) {
      peerConfig.stream = this.localStream;
      console.log(`[WebRTC] Peer ${peerId}에 로컬 스트림 연결 (ID: ${this.localStream.id})`);
    } else {
      console.warn(`[WebRTC] Peer ${peerId} 생성 시 로컬 스트림 없음`);
    }

    const peer = new Peer(peerConfig);
    
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    this.connectionRetries.set(peerId, 0);
    
    peer.on('connect', () => {
      this.setupDataChannelBuffer(peer, peerId);
      this.connectionRetries.set(peerId, 0);
      console.log(`[WebRTC] Peer ${peerId} 연결 완료`);
    });
    
    return peer;
  }

  /**
   * DataChannel 버퍼 설정
   */
  private setupDataChannelBuffer(peer: PeerInstance, peerId: string): void {
    const channel = (peer as any)._channel;
    if (!channel) return;

    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
    channel.onbufferedamountlow = () => {
      this.events.onBufferLow?.(peerId);
    };

    console.log(`[WebRTC] DataChannel 버퍼 임계값 설정 (Peer ${peerId})`);
  }

  /**
   * Flow Control을 사용한 데이터 전송
   */
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
    const MAX_BUFFER = 256 * 1024; // 256KB
    
    while (channel.bufferedAmount > MAX_BUFFER) {
      if (Date.now() - startTime > timeout) {
        console.warn(`[WebRTC] Peer ${peerId} 버퍼 대기 타임아웃, 전송 취소`);
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
        console.warn(`[WebRTC] Peer ${peerId} 전송 큐 가득참, 재시도 필요`);
        return false;
      }
      console.warn(`[WebRTC] Peer ${peerId} 전송 실패:`, error);
      return false;
    }
  }

  /**
   * 특정 Peer에게 메시지 전송
   */
  public sendToPeer(peerId: string, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected || peer.destroyed) {
      console.warn(`[WebRTC] Peer ${peerId} 전송 불가: 연결 없음`);
      return false;
    }

    try {
      const channel = (peer as any)._channel;
      if (!channel || channel.readyState !== 'open') {
        console.warn(`[WebRTC] Peer ${peerId} 전송 불가: 채널 닫힘`);
        return false;
      }

      peer.send(message);
      return true;
    } catch (error) {
      console.error(`[WebRTC] Peer ${peerId} 전송 실패:`, error);
      return false;
    }
  }

  /**
   * 시그널 수신
   */
  public receiveSignal(from: string, nickname: string, signal: SignalData): void {
    const existingPeer = this.peers.get(from);
    if (existingPeer && !existingPeer.destroyed) {
      existingPeer.signal(signal);
    } else {
      const peer = this.createPeer(from, false);
      peer.signal(signal);
    }
  }

  /**
   * Peer에게 시그널 전송
   */
  public signalPeer(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer && !peer.destroyed) {
      try {
        peer.signal(signal);
      } catch (error) {
        console.error(`[WebRTC] Peer ${peerId} 시그널 전송 실패:`, error);
      }
    }
  }

  /**
   * Peer 제거
   */
  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        if (!peer.destroyed) {
          peer.destroy();
        }
      } catch (error) {
        console.warn(`[WebRTC] Peer ${peerId} 제거 중 오류:`, error);
      }
      this.peers.delete(peerId);
    }
    
    this.connectionRetries.delete(peerId);
    this.streamBackup.delete(peerId);
    
    console.log(`[WebRTC] Peer ${peerId} 제거 완료`);
  }
  
  /**
   * 모든 Peer에게 메시지 전송
   */
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
                console.warn(`[WebRTC] Peer ${peerId} 대용량 전송 실패`);
              }
            });
          } else {
            peer.send(message);
          }
          successful.push(peerId);
        } catch (error) {
          console.warn(`[WebRTC] Peer ${peerId} 전송 실패:`, error);
          failed.push(peerId);
        }
      } else {
        failed.push(peerId);
      }
    });
    
    return { successful, failed };
  }

  /**
   * 모든 Peer에 트랙 추가
   */
  public addTrackToAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.addTrack(track, stream);
          console.log(`[WebRTC] Peer ${peerId} 트랙 추가 완료`);
        } catch (error) {
          console.error(`[WebRTC] Peer ${peerId} 트랙 추가 실패:`, error);
        }
      }
    });
  }

  /**
   * 모든 Peer에서 트랙 제거
   */
  public removeTrackFromAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.removeTrack(track, stream);
          console.log(`[WebRTC] Peer ${peerId} 트랙 제거 완료`);
        } catch (error) {
          console.error(`[WebRTC] Peer ${peerId} 트랙 제거 실패:`, error);
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
  
  /**
   * 연결된 Peer ID 목록 반환
   */
  public getConnectedPeerIds(): string[] {
    return Array.from(this.peers.keys()).filter(peerId => {
      const peer = this.peers.get(peerId);
      return peer?.connected && !peer?.destroyed;
    });
  }

  /**
   * Peer의 DataChannel 버퍼 크기 반환
   */
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

  /**
   * Peer 존재 여부 확인
   */
  public hasPeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer ? !peer.destroyed : false;
  }

  /**
   * Peer 연결 상태 확인
   */
  public isPeerConnected(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer ? peer.connected && !peer.destroyed : false;
  }

  /**
   * 모든 Peer 연결 종료
   */
  public destroyAll(): void {
    this.peers.forEach((peer, peerId) => {
      try {
        if (!peer.destroyed) {
          peer.destroy();
        }
      } catch (error) {
        console.warn(`[WebRTC] Peer ${peerId} 종료 중 오류:`, error);
      }
    });
    this.peers.clear();
    this.connectionRetries.clear();
    this.streamBackup.clear();
    
    console.log('[WebRTC] 모든 Peer 연결 종료 완료');
  }

  /**
   * Peer 이벤트 설정
   */
  private setupPeerEvents(peer: PeerInstance, peerId: string): void {
    peer.on('signal', (signal) => this.events.onSignal(peerId, signal));
    peer.on('connect', () => this.events.onConnect(peerId));
    peer.on('stream', (stream) => {
      console.log(`[WebRTC] Peer ${peerId} 스트림 수신`);
      
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      if (videoTracks.length > 0) {
        console.log(`[WebRTC] 비디오 트랙 ${videoTracks.length}개 수신`);
        if (videoTracks[0].label.includes('captureStream')) {
          console.log(`[WebRTC] Peer ${peerId}가 화면 공유 중`);
        }
      }
      
      if (audioTracks.length > 0) {
        console.log(`[WebRTC] 오디오 트랙 ${audioTracks.length}개 수신`);
      }
      
      this.events.onStream(peerId, stream);
    });
    peer.on('data', (data) => this.events.onData(peerId, data));
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.handlePeerError(peerId, err));
  }

  /**
   * Peer 에러 핸들링
   */
  private handlePeerError(peerId: string, error: Error): void {
    // OperationError는 정상적인 종료 과정에서 발생할 수 있으므로 경고만 출력
    if (error.name === 'OperationError') {
      console.warn(`[WebRTC] Peer ${peerId} OperationError (무시 가능). 연결 재시도 필요 없음.`);
      return;
    }

    const retries = this.connectionRetries.get(peerId) || 0;
    if (retries < this.MAX_RETRIES) {
      console.warn(`[WebRTC] Peer ${peerId} 오류 발생, 재시도 ${retries + 1}/${this.MAX_RETRIES}:`, error.message);
      this.connectionRetries.set(peerId, retries + 1);
    } else {
      console.error(`[WebRTC] Peer ${peerId} 최대 재시도 초과, Peer 제거:`, error);
      this.events.onError(peerId, error);
    }
  }
}