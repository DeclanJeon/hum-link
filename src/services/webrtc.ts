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
      audioTracks: localStream?.getAudioTracks().length || 0,
      streamId: localStream?.id
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
    console.log('[WebRTC] ICE 서버 업데이트 완료 (TURN 포함)');
    
    const turnServers = servers.filter(s => 
      s.urls.toString().includes('turn')
    );
    console.log(`[WebRTC] TURN 서버 ${turnServers.length}개 설정됨`);
  }

  /**
   * 🔥 개선된 트랙 교체 메서드 - 원격 피어 스트림 동기화 보장
   */
  public async replaceTrack(
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack,
    stream: MediaStream
  ): Promise<void> {
    const results: Array<{ peerId: string; success: boolean; error?: Error }> = [];
    
    console.log(`[WebRTC] 🔄 트랙 교체 시작`);
    console.log(`[WebRTC] 이전 트랙: ${oldTrack.label} (${oldTrack.kind})`);
    console.log(`[WebRTC] 새 트랙: ${newTrack.label} (${newTrack.kind})`);
    console.log(`[WebRTC] 대상 Peer 수: ${this.peers.size}`);
    console.log(`[WebRTC] 스트림 ID: ${stream.id}`);
    console.log(`[WebRTC] WebRTCManager.localStream ID: ${this.localStream?.id}`);
    
    // 🔥 1. WebRTCManager의 localStream 먼저 업데이트
    if (this.localStream) {
      console.log('[WebRTC] 📦 WebRTCManager.localStream 업데이트 중...');
      
      const existingTrack = this.localStream.getTracks().find(
        t => t.kind === oldTrack.kind && t.id === oldTrack.id
      );
      
      if (existingTrack) {
        console.log(`[WebRTC] 기존 트랙 제거: ${existingTrack.label}`);
        this.localStream.removeTrack(existingTrack);
        
        // 트랙 정리는 호출자가 담당하도록 변경 (중복 stop 방지)
        // existingTrack.stop();
      }
      
      this.localStream.addTrack(newTrack);
      console.log(`[WebRTC] ✅ WebRTCManager.localStream 업데이트 완료`);
      console.log(`[WebRTC] 현재 localStream 트랙:`, {
        audio: this.localStream.getAudioTracks().map(t => t.label),
        video: this.localStream.getVideoTracks().map(t => t.label)
      });
    } else {
      console.warn('[WebRTC] ⚠️ WebRTCManager.localStream이 null입니다');
    }
    
    // Peer 연결이 없으면 조기 종료
    if (this.peers.size === 0) {
      console.log('[WebRTC] 연결된 Peer가 없어 트랙 교체를 건너뜁니다');
      return;
    }
    
    // 🔥 2. 각 Peer Connection의 Sender 업데이트
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.destroyed) {
        console.warn(`[WebRTC] Peer ${peerId} 파괴됨, 건너뜀`);
        results.push({ peerId, success: false, error: new Error('Peer destroyed') });
        continue;
      }
      
      try {
        console.log(`[WebRTC] 🔄 Peer ${peerId} 트랙 교체 시작...`);
        
        // 🔥 3. replaceTrack 호출 (업데이트된 localStream 전달)
        await peer.replaceTrack(oldTrack, newTrack, this.localStream!);
        
        console.log(`[WebRTC] ✅ Peer ${peerId} replaceTrack 완료`);
        results.push({ peerId, success: true });
        
        // 🔥 4. Renegotiation 트리거 (중요!)
        await this.triggerRenegotiation(peerId, peer);
        
        // 약간의 지연을 두어 시그널링 완료 대기
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[WebRTC] ❌ Peer ${peerId} 트랙 교체 실패:`, error);
        
        // Fallback: removeTrack + addTrack 시도
        try {
          console.log(`[WebRTC] 🔄 Peer ${peerId} Fallback 방식 시도 (removeTrack + addTrack)...`);
          
          await peer.removeTrack(oldTrack, stream);
          await peer.addTrack(newTrack, this.localStream!);
          
          console.log(`[WebRTC] ✅ Peer ${peerId} Fallback 성공`);
          results.push({ peerId, success: true });
          
          // Fallback 성공 시에도 Renegotiation
          await this.triggerRenegotiation(peerId, peer);
          
        } catch (fallbackError) {
          console.error(`[WebRTC] ❌ Peer ${peerId} Fallback 실패:`, fallbackError);
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
    
    console.log(`[WebRTC] 📊 트랙 교체 결과: ${successful}개 성공, ${failed}개 실패`);
    
    if (failed > 0) {
      const failedPeers = results.filter(r => !r.success).map(r => r.peerId).join(', ');
      console.error(`[WebRTC] ⚠️ 실패한 Peer: ${failedPeers}`);
      
      throw new Error(
        `${failed}개 Peer에서 트랙 교체 실패: ${failedPeers}`
      );
    }
    
    console.log('[WebRTC] ✅ 모든 Peer 트랙 교체 완료');
  }

  /**
   * 🔥 Renegotiation 트리거 메서드 (새로 추가)
   */
  private async triggerRenegotiation(peerId: string, peer: PeerInstance): Promise<void> {
    try {
      const pc = (peer as any)._pc as RTCPeerConnection;
      
      if (!pc) {
        console.warn(`[WebRTC] Peer ${peerId}의 RTCPeerConnection을 찾을 수 없습니다`);
        return;
      }
      
      console.log(`[WebRTC] 🔄 Peer ${peerId} Renegotiation 시작...`);
      console.log(`[WebRTC] Signaling State: ${pc.signalingState}`);
      console.log(`[WebRTC] ICE Connection State: ${pc.iceConnectionState}`);
      
      // Signaling State가 stable이 아니면 대기
      if (pc.signalingState !== 'stable') {
        console.log(`[WebRTC] Peer ${peerId} Signaling State가 ${pc.signalingState}이므로 대기 중...`);
        
        // Stable 상태가 될 때까지 최대 3초 대기
        await this.waitForStableState(pc, 3000);
      }
      
      // Stable 상태에서만 새로운 offer 생성
      if (pc.signalingState === 'stable') {
        console.log(`[WebRTC] Peer ${peerId} 새로운 offer 생성 중...`);
        
        // Sender 상태 로깅
        const senders = pc.getSenders();
        console.log(`[WebRTC] Peer ${peerId} Senders:`, senders.map(s => ({
          track: s.track?.label,
          kind: s.track?.kind,
          enabled: s.track?.enabled,
          readyState: s.track?.readyState
        })));
        
        // Simple-Peer는 자동으로 renegotiation을 처리하지만
        // 명시적으로 트리거하려면 _needsNegotiation 플래그 설정
        (peer as any)._needsNegotiation = true;
        
        // 내부적으로 offer 생성 및 전송 트리거
        if (typeof (peer as any)._onNegotiationNeeded === 'function') {
          (peer as any)._onNegotiationNeeded();
        }
        
        console.log(`[WebRTC] ✅ Peer ${peerId} Renegotiation 트리거 완료`);
      } else {
        console.warn(`[WebRTC] ⚠️ Peer ${peerId} Signaling State가 여전히 ${pc.signalingState}입니다`);
      }
      
    } catch (error) {
      console.warn(`[WebRTC] ⚠️ Peer ${peerId} Renegotiation 실패:`, error);
      // Renegotiation 실패는 치명적이지 않으므로 에러를 throw하지 않음
    }
  }

  /**
   * 🔥 Stable State 대기 헬퍼 메서드 (새로 추가)
   */
  private async waitForStableState(pc: RTCPeerConnection, timeout: number = 3000): Promise<void> {
    const startTime = Date.now();
    
    while (pc.signalingState !== 'stable') {
      if (Date.now() - startTime > timeout) {
        console.warn('[WebRTC] Stable state 대기 시간 초과');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
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

    console.log(`[WebRTC] Peer ${peerId} 생성 시작 (ICE 서버 수: ${peerConfig.config.iceServers.length})`);

    if (this.localStream && this.localStream.getTracks().length > 0) {
      peerConfig.stream = this.localStream;
      console.log(`[WebRTC] Peer ${peerId}에 로컬 스트림 연결 (ID: ${this.localStream.id})`);
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

    console.log(`[WebRTC] DataChannel 버퍼 임계값 설정 (Peer ${peerId})`);
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
        console.warn(`[WebRTC] Peer ${peerId} 전송 큐 가득참, 재시도 필요`);
        return false;
      }
      console.warn(`[WebRTC] Peer ${peerId} 전송 실패:`, error);
      return false;
    }
  }

  public sendToPeer(peerId: string, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected || peer.destroyed) {
      console.warn(`[WebRTC] Peer ${peerId} 전송 불가: 연결 끊김`);
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
        console.error(`[WebRTC] Peer ${peerId} 시그널 전송 실패:`, error);
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
        console.warn(`[WebRTC] Peer ${peerId} 제거 중 오류:`, error);
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
          console.warn(`[WebRTC] Peer ${peerId} 전송 실패:`, error);
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
   * 🔥 로컬 스트림 업데이트 메서드 개선
   */
  public updateLocalStream(newStream: MediaStream | null): void {
    if (this.localStream) {
      this.streamBackup.set('previous', this.localStream);
      console.log('[WebRTC] 이전 스트림 백업 완료:', this.localStream.id);
    }
    
    this.localStream = newStream;
    
    console.log('[WebRTC] 로컬 스트림 업데이트:', {
      streamId: newStream?.id,
      audioTracks: newStream?.getAudioTracks().length || 0,
      videoTracks: newStream?.getVideoTracks().length || 0
    });
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
        console.warn(`[WebRTC] Peer ${peerId} 파괴 중 오류:`, error);
      }
    });
    this.peers.clear();
    this.connectionRetries.clear();
    this.streamBackup.clear();
    
    console.log('[WebRTC] 모든 Peer 연결 종료됨');
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
          console.log(`[WebRTC] Peer ${peerId}가 파일 스트리밍 중`);
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
      console.warn(`[WebRTC] Peer ${peerId} OperationError (일시적 오류). 무시합니다.`);
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