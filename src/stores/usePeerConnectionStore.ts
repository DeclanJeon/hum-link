import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';

// useChatStore      import .
let useChatStore: any;
import('./useChatStore').then(mod => {
  useChatStore = mod.useChatStore;
});

export interface PeerState {
  userId: string;
  nickname: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSharingScreen: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  transcript?: { text: string; isFinal: boolean; lang: string };
}

interface PeerConnectionEvents {
    onData: (peerId: string, data: any) => void;
}

interface PeerConnectionState {
  webRTCManager: WebRTCManager | null;
  localStream?: MediaStream;
  peers: Map<string, PeerState>;
  // [웹 워커] 파일 전송 워커 인스턴스를 관리합니다. transferId를 키로 사용합니다.
  workers: Map<string, Worker>;
}

interface PeerConnectionActions {
    initialize: (localStream: MediaStream, events: PeerConnectionEvents) => void;
    createPeer: (userId: string, nickname: string, initiator: boolean) => void;
    receiveSignal: (from: string, nickname: string, signal: SignalData) => void;
    removePeer: (userId: string) => void;
    sendToAllPeers: (message: any) => { successful: string[], failed: string[] };
    replaceTrack: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream) => void;
    sendFile: (file: File) => Promise<void>;
    cleanup: () => void;
    updatePeerMediaState: (userId: string, kind: 'audio' | 'video', enabled: boolean) => void;
    // [웹 워커] ACK 처리 로직은 워커로 메시지를 전달하는 역할로 변경됩니다.
    resolveAck: (transferId: string, chunkIndex: number) => void;
}

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  peers: new Map(),
  // [웹 워커] 워커 맵 초기화
  workers: new Map(),

  initialize: (localStream, events) => {
    const webRTCManager = new WebRTCManager(localStream, {
      onSignal: (peerId, signal) => useSignalingStore.getState().sendSignal(peerId, signal),
      onConnect: (peerId) => set(produce(state => { if (state.peers.has(peerId)) state.peers.get(peerId)!.connectionState = 'connected'; })),
      onStream: (peerId, stream) => set(produce(state => { if (state.peers.has(peerId)) state.peers.get(peerId)!.stream = stream; })),
      onData: events.onData,
      onClose: (peerId) => get().removePeer(peerId),
      onError: (peerId, error) => {
        if (error.name === 'OperationError') {
            console.warn(`[PEER_CONNECTION] Non-fatal OperationError on peer (${peerId}). Flow control will handle it. Error: ${error.message}`);
            return;
        }
        console.error(`[PEER_CONNECTION] Unrecoverable fatal error on peer (${peerId}), removing peer:`, error);
        get().removePeer(peerId);
      },
    });
    set({ webRTCManager, localStream });
  },

  createPeer: (userId, nickname, initiator) => {
    get().webRTCManager?.createPeer(userId, initiator);
    set(produce(state => { state.peers.set(userId, { userId, nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' }); }));
  },
  
  receiveSignal: (from, nickname, signal) => {
    const { webRTCManager, peers } = get();
    if (!webRTCManager) return;
    if (peers.has(from)) {
       webRTCManager.signalPeer(from, signal);
    } else {
      const peer = webRTCManager.createPeer(from, false);
      peer.signal(signal);
      set(produce(state => { state.peers.set(from, { userId: from, nickname, audioEnabled: true, videoEnabled: true, isSharingScreen: false, connectionState: 'connecting' }); }));
    }
  },

  removePeer: (userId) => {
    get().webRTCManager?.removePeer(userId);
    set(produce(state => { state.peers.delete(userId); }));
  },

  sendToAllPeers: (message) => get().webRTCManager?.sendToAllPeers(message) ?? { successful: [], failed: [] },

  replaceTrack: (oldTrack, newTrack, stream) => get().webRTCManager?.replaceTrack(oldTrack, newTrack, stream),

  // [웹 워커] ACK 수신 시, 해당하는 워커에게 메시지를 전달합니다.
  resolveAck: (transferId, chunkIndex) => {
    const worker = get().workers.get(transferId);
    if (worker) {
      worker.postMessage({
        type: 'ack-received',
        payload: { transferId, chunkIndex }
      });
    }
  },

  // ====================================================================
  // [웹 워커] sendFile 로직을 웹 워커를 사용하도록 전면 재구성합니다.
  // ====================================================================
  sendFile: async (file: File) => {
    const { webRTCManager, sendToAllPeers, workers } = get();
    if (!useChatStore) {
        console.error("[FILE_TRANSFER] Chat store is not ready yet.");
        return;
    }
    const { addFileMessage, updateFileProgress } = useChatStore.getState();

    if (!webRTCManager) {
      console.error("[FILE_TRANSFER] WebRTCManager is not initialized.");
      return;
    }

    const totalChunks = Math.ceil(file.size / (64 * 1024));
    const transferId = `${file.name}-${file.size}-${Date.now()}`;
    const fileMeta = { transferId, name: file.name, size: file.size, type: file.type, totalChunks };

    // UI에 파일 메시지를 먼저 표시합니다.
    await addFileMessage('local-user', 'You', fileMeta, true);
    // 다른 피어들에게 파일 전송 시작을 알립니다.
    sendToAllPeers(JSON.stringify({ type: 'file-meta', payload: fileMeta }));

    // 웹 워커를 생성하고 작업을 시작시킵니다.
    const worker = new Worker(new URL('../workers/file.worker.ts', import.meta.url), { type: 'module' });

    // 생성된 워커를 맵에 저장하여 관리합니다.
    set(produce(state => { state.workers.set(transferId, worker); }));

    // 워커로부터 메시지를 수신하는 리스너를 설정합니다.
    worker.onmessage = (event) => {
      const { type, payload } = event.data;
      switch (type) {
        case 'chunk-ready':
          // 워커가 준비한 청크를 데이터 채널로 전송합니다.
          sendToAllPeers(payload.chunk);
          break;
        case 'progress-update':
          // 워커가 보낸 진행 상황을 UI에 반영합니다.
          updateFileProgress(payload.transferId, payload.loaded);
          break;
        case 'transfer-complete':
          // 전송이 완료되면 워커를 종료하고 맵에서 제거합니다.
          console.log(`[FILE_TRANSFER] Worker for ${payload.transferId} finished.`);
          worker.terminate();
          set(produce(state => { state.workers.delete(payload.transferId); }));
          break;
        case 'transfer-error':
          console.error(`[FILE_TRANSFER] Error from worker for ${payload.transferId}:`, payload.error);
          worker.terminate();
          set(produce(state => { state.workers.delete(payload.transferId); }));
          // 여기에 사용자에게 에러를 알리는 UI 로직(e.g., toast)을 추가할 수 있습니다.
          break;
      }
    };

    worker.onerror = (error) => {
        console.error(`[FILE_TRANSFER] Uncaught error in worker for ${transferId}:`, error);
        set(produce(state => { state.workers.delete(transferId); }));
    };

    // 워커에게 파일 전송 시작을 명령합니다.
    worker.postMessage({
      type: 'start-transfer',
      payload: { file, transferId }
    });
  },
  
  cleanup: () => {
    get().webRTCManager?.destroyAll();
    // [웹 워커] 정리 시 모든 활성 워커를 종료합니다.
    get().workers.forEach(worker => worker.terminate());
    set({ webRTCManager: null, peers: new Map(), workers: new Map() });
  },

  updatePeerMediaState: (userId, kind, enabled) => {
    set(produce(state => {
      const peer = state.peers.get(userId);
      if (peer) {
        if (kind === 'audio') peer.audioEnabled = enabled;
        else if (kind === 'video') peer.videoEnabled = enabled;
      }
    }));
  }
}));
