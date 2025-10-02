// frontend/src/services/webrtc.ts
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
    
    console.log('[WebRTC] Manager initialized with stream:', {
      hasStream: !!localStream,
      videoTracks: localStream?.getVideoTracks().length || 0,
      audioTracks: localStream?.getAudioTracks().length || 0
    });
  }

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:turn.peerterra.com:3478',
      username: 'kron_turn',
      credential: 'kron1234'
    }
  ];
  
  /**
   * ICE 서버 업데이트
   */
  public updateIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers;
    console.log('[WebRTC] ICE 서버가 업데이트됨 (TURN 포함)');
    
    const turnServers = servers.filter(s => 
      s.urls.toString().includes('turn')
    );
    console.log(`[WebRTC] TURN 서버 ${turnServers.length}개 등록됨`);
  }

  /**
   * 트랙 교체 - 모든 피어에 대해
   * 핵심: stream 인자는 "Peer에 추가된 스트림"이어야 함
   */
  public async replaceTrack(
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack,
    stream: MediaStream
  ): Promise<void> {
    const results: Array<{ peerId: string; success: boolean; error?: Error }> = [];
    
    console.log(`[WebRTC] 트랙 교체 시작`);
    console.log(`[WebRTC] 이전 트랙: ${oldTrack.label} (${oldTrack.kind})`);
    console.log(`[WebRTC] 새 트랙: ${newTrack.label} (${newTrack.kind})`);
    console.log(`[WebRTC] 대상 Peer 수: ${this.peers.size}`);
    console.log(`[WebRTC] 스트림 ID: ${stream.id}`);
    
    // Peer가 없으면 조기 반환
    if (this.peers.size === 0) {
      console.log('[WebRTC] 연결된 Peer가 없어 트랙 교체 스킵');
      return;
    }
    
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.destroyed) {
        console.warn(`[WebRTC] Peer ${peerId}가 파괴됨, 스킵`);
        results.push({ peerId, success: false, error: new Error('Peer destroyed') });
        continue;
      }
      
      try {
        console.log(`[WebRTC] Peer ${peerId}에 트랙 교체 시도...`);
        
        // 핵심: replaceTrack 호출 시 stream은 기존 localStream
        await peer.replaceTrack(oldTrack, newTrack, stream);
        
        console.log(`[WebRTC] Peer ${peerId} 트랙 교체 성공`);
        results.push({ peerId, success: true });
        
        // 약간의 지연 (Renegotiation 대기)
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[WebRTC] Peer ${peerId} 트랙 교체 실패:`, error);
        
        // Fallback: removeTrack + addTrack
        try {
          console.log(`[WebRTC] Peer ${peerId} Fallback 시도 (removeTrack + addTrack)...`);
          
          await peer.removeTrack(oldTrack, stream);
          await peer.addTrack(newTrack, stream);
          
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
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      },
      offerOptions: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }
    };

    console.log(`[WebRTC] Peer ${peerId} 생성 중 (ICE 서버 수: ${peerConfig.config.iceServers.length})`);

    if (this.localStream && this.localStream.getTracks().length > 0) {
      peerConfig.stream = this.localStream;
      console.log(`[WebRTC] Peer ${peerId}에 로컬 스트림 추가 (ID: ${this.localStream.id})`);
    }

    const peer = new Peer(peerConfig);
    
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    this.connectionRetries.set(peerId, 0);
    
    peer.on('connect', () => {
      this.setupDataChannelBuffer(peer, peerId);
      this.connectionRetries.set(peerId, 0);
      console.log(`[WebRTC] Peer ${peerId} 연결됨`);
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

    console.log(`[WebRTC] DataChannel 버퍼 설정 완료 (Peer ${peerId})`);
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
        console.warn(`[WebRTC] Peer ${peerId} 버퍼 대기 시간 초과, 전송 포기`);
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
        console.warn(`[WebRTC] Peer ${peerId} 큐가 가득 참, 재시도 필요`);
        return false;
      }
      console.warn(`[WebRTC] Peer ${peerId} 전송 실패:`, error);
      return false;
    }
  }

  public sendToPeer(peerId: string, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected || peer.destroyed) {
      console.warn(`[WebRTC] Peer ${peerId} 전송 실패: 연결 안됨`);
      return false;
    }

    try {
      const channel = (peer as any)._channel;
      if (!channel || channel.readyState !== 'open') {
        console.warn(`[WebRTC] Peer ${peerId} 전송 실패: 채널 닫힘`);
        return false;
      }

      peer.send(message);
      return true;
    } catch (error) {
      console.error(`[WebRTC] Peer ${peerId} 전송 에러:`, error);
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
        console.error(`[WebRTC] Peer ${peerId} 시그널 에러:`, error);
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
        console.warn(`[WebRTC] Peer ${peerId} 제거 에러:`, error);
      }
      this.peers.delete(peerId);
    }
    
    this.connectionRetries.delete(peerId);
    this.streamBackup.delete(peerId);
    
    console.log(`[WebRTC] Peer ${peerId} 제거됨`);
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
                console.warn(`[WebRTC] Peer ${peerId} 플로우 컨트롤 전송 실패`);
              }
            });
          } else {
            peer.send(message);
          }
          successful.push(peerId);
        } catch (error) {
          console.warn(`[WebRTC] Peer ${peerId} 전송 에러:`, error);
          failed.push(peerId);
        }
      } else {
        failed.push(peerId);
      }
    });
    
    return { successful, failed };
  }

  public addTrackToAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.addTrack(track, stream);
          console.log(`[WebRTC] Peer ${peerId} 트랙 추가됨`);
        } catch (error) {
          console.error(`[WebRTC] Peer ${peerId} 트랙 추가 실패:`, error);
        }
      }
    });
  }

  public removeTrackFromAllPeers(track: MediaStreamTrack, stream: MediaStream): void {
    this.peers.forEach((peer, peerId) => {
      if (!peer.destroyed) {
        try {
          peer.removeTrack(track, stream);
          console.log(`[WebRTC] Peer ${peerId} 트랙 제거됨`);
        } catch (error) {
          console.error(`[WebRTC] Peer ${peerId} 트랙 제거 실패:`, error);
        }
      }
    });
  }

  /**
   * 로컬 스트림 업데이트
   * 주의: 이 메서드는 스트림 객체를 교체하는 것이 아니라 백업용
   */
  public updateLocalStream(newStream: MediaStream | null): void {
    if (this.localStream) {
      this.streamBackup.set('previous', this.localStream);
    }
    
    this.localStream = newStream;
    
    console.log('[WebRTC] 로컬 스트림 업데이트됨');
  }

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
        console.warn(`[WebRTC] Peer ${peerId} 파괴 에러:`, error);
      }
    });
    this.peers.clear();
    this.connectionRetries.clear();
    this.streamBackup.clear();
    
    console.log('[WebRTC] 모든 Peer 파괴됨');
  }

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
          console.log(`[WebRTC] Peer ${peerId}가 파일을 스트리밍 중`);
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

  private handlePeerError(peerId: string, error: Error): void {
    if (error.name === 'OperationError') {
      console.warn(`[WebRTC] Peer ${peerId} OperationError (무시됨). 재연결 시도하지 않음.`);
      return;
    }

    const retries = this.connectionRetries.get(peerId) || 0;
    if (retries < this.MAX_RETRIES) {
      console.warn(`[WebRTC] Peer ${peerId} 에러 발생, 재시도 ${retries + 1}/${this.MAX_RETRIES}:`, error.message);
      this.connectionRetries.set(peerId, retries + 1);
    } else {
      console.error(`[WebRTC] Peer ${peerId} 최대 재시도 초과, Peer 제거:`, error);
      this.events.onError(peerId, error);
    }
  }
}
