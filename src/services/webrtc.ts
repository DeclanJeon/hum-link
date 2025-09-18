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
      initiator: true,
      stream: this.localStream,
      trickle: true,
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
      initiator: false,
      stream: this.localStream,
      trickle: true,
    });

    peer.signal(signal);
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
   * 모든 연결된 Peer의 비디오 트랙을 교체합니다.
   * simple-peer의 replaceTrack 메서드를 올바르게 사용하도록 수정되었습니다.
   * @param newTrack 교체할 새로운 MediaStreamTrack (카메라 또는 화면)
   * @returns 교체 성공 여부
   */
  public async replaceTrack(newTrack: MediaStreamTrack): Promise<boolean> {
    try {
      const oldTrack = this.localStream.getVideoTracks()[0];
      if (!oldTrack) {
        console.error("[WebRTCManager] No old video track found to replace.");
        return false;
      }

      // 모든 peer에 대해 트랙 교체 시도
      this.peers.forEach((peer, peerId) => {
        try {
          // simple-peer의 replaceTrack은 Promise를 반환하지 않습니다.
          // 에러가 발생하면 예외를 던지므로 try...catch로 잡습니다.
          peer.replaceTrack(oldTrack, newTrack, this.localStream);
          console.log(`[WebRTCManager] Track replacement initiated for peer ${peerId}`);
        } catch (err) {
          console.error(`[WebRTCManager] Failed to replace track for peer ${peerId}:`, err);
          // 여기서 발생한 에러를 상위 catch 블록으로 던집니다.
          throw err;
        }
      });

      // 로컬 스트림의 트랙도 교체하여 내부 상태를 일치시킵니다.
      // 이 작업은 peer.replaceTrack 호출 이후에 이루어져야 합니다.
      this.localStream.removeTrack(oldTrack);
      this.localStream.addTrack(newTrack);
      
      console.log('[WebRTCManager] Track replacement process completed for all peers.');
      
      // simple-peer의 replaceTrack은 비동기적으로 작동하지만,
      // 즉시 반환되므로 성공적으로 호출되었다고 가정합니다.
      return true;

    } catch (error) {
      console.error('[WebRTCManager] An error occurred during the track replacement process:', error);
      // 에러가 발생했으므로 false를 반환합니다.
      return false;
    }
  }

  /**
   * 모든 peer connection에 대해 비디오 트랙 교체 (simple-peer용)
   * @param newTrack 교체할 새로운 MediaStreamTrack
   * @returns 교체 성공 여부
   */
  public async replaceVideoTrackForAllPeers(newTrack: MediaStreamTrack): Promise<boolean> {
    return this.replaceTrack(newTrack);
  }

  /**
   * 로컬 스트림 완전 교체 및 재협상
   * @param newStream 새로운 MediaStream
   */
  public async updateLocalStream(newStream: MediaStream): Promise<void> {
    this.localStream = newStream;
    
    // 모든 peer connection 재협상
    for (const [peerId, peer] of this.peers.entries()) {
      // 기존 트랙 제거
      peer.getSenders().forEach(sender => {
        if (sender.track) {
          peer.removeTrack(sender);
        }
      });
      
      // 새 트랙 추가
      newStream.getTracks().forEach(track => {
        peer.addTrack(track, newStream);
      });
      
      // 재협상
      await this.createAndSendOffer(peerId);
    }
  }

  /**
   * Offer를 생성하고 전송합니다. (재협상용)
   * @param peerId Peer ID
   */
  private async createAndSendOffer(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        this.events.onSignal(peerId, offer);
      } catch (error) {
        console.error('[WebRTC] Error creating offer:', error);
      }
    }
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
