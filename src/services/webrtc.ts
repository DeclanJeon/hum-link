import Peer from 'simple-peer/simplepeer.min.js';
import type { Instance as PeerInstance, SignalData } from 'simple-peer';

// WebRTC 이벤트에 대한 콜백 인터페이스
interface WebRTCEvents {
  onSignal: (peerId: string, signal: SignalData) => void;
  onConnect: (peerId: string) => void;
  onStream: (peerId: string, stream: MediaStream) => void;
  onData: (peerId: string, data: any) => void;
  onClose: (peerId: string) => void;
  onError: (peerId: string, error: Error) => void;
}

/**
 * WebRTCManager 클래스
 * simple-peer를 사용하여 Peer Connection 생성을 관리하고 이벤트를 처리합니다.
 */
export class WebRTCManager {
  private peers: Map<string, PeerInstance> = new Map();
  private localStream: MediaStream;
  private events: WebRTCEvents;

  constructor(localStream: MediaStream, events: WebRTCEvents) {
    console.log('[WebRTCManager] Constructor called');
    this.localStream = localStream;
    this.events = events;
  }

  /**
   * 새로운 Peer를 생성 (주로 통화를 거는 쪽에서 사용)
   * @param peerId 상대방의 ID
   * @returns 생성된 Peer 인스턴스
   */
  public createPeer(peerId: string): PeerInstance {
    console.log('[WebRTCManager] Creating peer (initiator)', { peerId });
    const peer = new Peer({
      initiator: true, // 이쪽에서 연결을 시작함
      stream: this.localStream,
      trickle: true, // ICE candidate를 점진적으로 교환
    });

    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    console.log('[WebRTCManager] Peer created and stored', { peerId });
    return peer;
  }

  /**
   * 들어온 시그널을 처리하여 Peer를 생성 (주로 통화를 받는 쪽에서 사용)
   * @param peerId 신호를 보낸 상대방의 ID
   * @param signal 수신된 시그널 데이터
   * @returns 생성된 Peer 인스턴스
   */
  public receiveSignal(peerId: string, signal: SignalData): PeerInstance {
    console.log('[WebRTCManager] Receiving signal and creating peer (non-initiator)', { peerId, signalType: signal.type });
    const peer = new Peer({
      initiator: false, // 상대방이 연결을 시작했음
      stream: this.localStream,
      trickle: true,
    });

    peer.signal(signal); // 수신한 시그널로 연결 설정
    this.setupPeerEvents(peer, peerId);
    this.peers.set(peerId, peer);
    console.log('[WebRTCManager] Peer created and stored from signal', { peerId });
    return peer;
  }

  /**
   * 특정 Peer에게 수신된 시그널을 전달합니다.
   * @param peerId 시그널을 전달할 Peer의 ID
   * @param signal 시그널 데이터
   */
  public signalPeer(peerId: string, signal: SignalData) {
    console.log('[WebRTCManager] Signaling peer', { peerId, signalType: signal.type });
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.signal(signal);
      console.log('[WebRTCManager] Signal sent to peer', { peerId });
    } else {
      console.warn('[WebRTCManager] Peer not found for signaling', { peerId });
    }
  }

  /**
   * 모든 Peer에게 채팅 메시지를 전송합니다.
   * @param message 전송할 메시지 객체
   */
  public sendChatMessage(message: object) {
    console.log('[WebRTCManager] Sending chat message');
    const messageString = JSON.stringify(message);
    let sentCount = 0;
    this.peers.forEach(peer => {
      if (peer.connected) {
        peer.send(messageString);
        sentCount++;
      }
    });
    console.log('[WebRTCManager] Chat message sent to peers', { sentCount });
  }

  /**
   * 화면 공유 스트림으로 기존 비디오 트랙을 교체합니다.
   * @param screenStream 화면 공유 MediaStream
   */
  public replaceTrack(newStream: MediaStream) {
    this.peers.forEach(peer => {
        const oldTrack = this.localStream.getVideoTracks()[0];
        const newTrack = newStream.getVideoTracks()[0];
        if (oldTrack && newTrack) {
            peer.replaceTrack(oldTrack, newTrack, this.localStream);
        }
    });
    // 새로운 화면 공유 스트림의 종료를 감지하기 위한 이벤트 리스너
    newStream.getVideoTracks()[0].onended = () => {
        // 원래 카메라 스트림으로 되돌리는 로직 필요 (useWebRTCStore에서 처리)
    };
  }


  /**
   * 특정 Peer 연결을 제거합니다.
   * @param peerId 제거할 Peer의 ID
   */
  public removePeer(peerId: string) {
    console.log('[WebRTCManager] Removing peer', { peerId });
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.destroy();
      this.peers.delete(peerId);
      console.log('[WebRTCManager] Peer removed', { peerId });
    } else {
      console.warn('[WebRTCManager] Peer not found for removal', { peerId });
    }
  }

  /**
   * 모든 Peer 연결을 종료하고 정리합니다.
   */
  public destroyAll() {
    console.log('[WebRTCManager] Destroying all peers', { peerCount: this.peers.size });
    this.peers.forEach(peer => peer.destroy());
    this.peers.clear();
    console.log('[WebRTCManager] All peers destroyed');
  }

  /**
   * 특정 Peer가 존재하는지 확인합니다.
   * @param peerId 확인할 Peer의 ID
   * @returns Peer 존재 여부
   */
  public hasPeer(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  private setupPeerEvents(peer: PeerInstance, peerId: string) {
    console.log('[WebRTCManager] Setting up peer events', { peerId });
    
    peer.on('signal', (signal) => {
      console.log('[WebRTCManager] Peer signal event', { peerId, signalType: signal.type });
      this.events.onSignal(peerId, signal);
    });
    
    peer.on('connect', () => {
      console.log('[WebRTCManager] Peer connect event', { peerId });
      this.events.onConnect(peerId);
    });
    
    peer.on('stream', (stream) => {
      console.log('[WebRTCManager] Peer stream event', { peerId, streamId: stream.id });
      this.events.onStream(peerId, stream);
    });
    
    peer.on('data', (data) => {
      console.log('[WebRTCManager] Peer data event', { peerId, dataType: typeof data });
      try {
        const parsedData = JSON.parse(data.toString());
        this.events.onData(peerId, parsedData);
      } catch (error) {
        console.error("Failed to parse data channel message:", error);
      }
    });
    
    peer.on('close', () => {
      console.log('[WebRTCManager] Peer close event', { peerId });
      this.events.onClose(peerId);
    });
    
    peer.on('error', (err) => {
      console.log('[WebRTCManager] Peer error event', { peerId, error: err.message });
      this.events.onError(peerId, err);
    });
  }
}
