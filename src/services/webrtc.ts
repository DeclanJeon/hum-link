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
 * WebRTCManager 클래스: simple-peer를 래핑하여 Peer Connection을 관리합니다.
 */
export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream;
  private events: WebRTCEvents;

  constructor(localStream: MediaStream, events: WebRTCEvents) {
    this.localStream = localStream;
    this.events = events;
  }

  /**
   * 새로운 Peer를 생성합니다 (연결 시작자).
   * @param peerId 상대방 Peer의 ID
   */
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

  /**
   * 시그널을 받아 새로운 Peer를 생성합니다 (연결 수신자).
   * @param peerId 상대방 Peer의 ID
   * @param signal 수신한 시그널링 데이터
   */
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

  /**
   * 기존 Peer에게 시그널을 전달합니다.
   * @param peerId 시그널을 전달할 Peer의 ID
   * @param signal 시그널링 데이터
   */
  public signalPeer(peerId: string, signal: SignalData): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      console.log('[WebRTCManager] Signaling existing peer', { peerId });
      peer.signal(signal);
    } else {
      console.warn(`[WebRTCManager] Peer not found for signaling: ${peerId}`);
    }
  }

  /**
   * 특정 Peer 연결을 제거하고 파괴합니다.
   * @param peerId 제거할 Peer의 ID
   */
  public removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      console.log('[WebRTCManager] Removing peer', { peerId });
      peer.destroy();
      this.peers.delete(peerId);
    }
  }
  
  /**
   * 모든 연결된 Peer에게 데이터 채널로 채팅 메시지를 전송합니다.
   * @param message 전송할 메시지 (문자열)
   * @returns 메시지 전송에 성공한 peer의 수
   */
  public sendChatMessageViaDataChannel(message: string): number {
    let sentCount = 0;
    this.peers.forEach((peer, peerId) => {
      if (peer.connected) {
        peer.send(message);
        sentCount++;
      }
    });
    return sentCount;
  }

   // ====================== [ ✨ 신규 추가 ✨ ] ======================
  /**
   * 데이터 채널을 통해 타이핑 상태 제어 메시지를 전송합니다.
   * @param message 전송할 타이핑 상태 메시지 (문자열)
   */
  public sendTypingStateViaDataChannel(message: string): void {
    this.peers.forEach((peer) => {
      if (peer.connected) {
        peer.send(message);
      }
    });
  }

  public async replaceTrack(newTrack: MediaStreamTrack): Promise<void> {
    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack) {
        this.localStream.removeTrack(oldTrack);
    }
    this.localStream.addTrack(newTrack);

    for (const peer of this.peers.values()) {
        if(peer.streams[0]) {
            const sender = peer.streams[0].getVideoTracks()[0];
            if(sender){
                await peer.replaceTrack(sender, newTrack, this.localStream);
            } else {
                peer.addTrack(newTrack, this.localStream);
            }
        }
    }
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
    peer.on('data', (data) => {
      try {
        this.events.onData(peerId, JSON.parse(data.toString()));
      } catch (e) {
        console.error("Error parsing data from peer:", e);
      }
    });
    peer.on('close', () => this.events.onClose(peerId));
    peer.on('error', (err) => this.events.onError(peerId, err));
  }



}