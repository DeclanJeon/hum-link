import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';

// useChatStore가 순환 참조를 일으키지 않도록 동적으로 import 합니다.
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
  pendingAcks: Map<string, () => void>; // ACK 대기 중인 Promise의 resolve 함수를 저장합니다.
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
    resolveAck: (transferId: string, chunkIndex: number) => void; // ACK 처리 액션
}

const FILE_CHUNK_SIZE = 64 * 1024; // 64KB

export const usePeerConnectionStore = create<PeerConnectionState & PeerConnectionActions>((set, get) => ({
  webRTCManager: null,
  peers: new Map(),
  pendingAcks: new Map(),

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

  resolveAck: (transferId, chunkIndex) => {
    const key = `${transferId}-${chunkIndex}`;
    const resolve = get().pendingAcks.get(key);
    if (resolve) {
      resolve();
      set(produce(state => { state.pendingAcks.delete(key); }));
    }
  },

  // ====================================================================
  // 🚀 대용량 파일 처리를 위해 수정된 sendFile 함수
  // ====================================================================
  sendFile: async (file: File) => {
    const { webRTCManager, sendToAllPeers } = get();
    // useChatStore가 로드될 때까지 기다립니다.
    if (!useChatStore) {
        console.error("[FILE_TRANSFER] Chat store is not ready yet.");
        return;
    }
    const { addFileMessage, updateFileProgress } = useChatStore.getState();

    if (!webRTCManager) { console.error("[FILE_TRANSFER] WebRTCManager is not initialized."); return; }

    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);
    const transferId = `${file.name}-${file.size}-${Date.now()}`;
    const fileMeta = { transferId, name: file.name, size: file.size, type: file.type, totalChunks };

    // UI에 파일 메시지를 먼저 표시합니다.
    await addFileMessage('local-user', 'You', fileMeta, true);
    // 상대방에게 파일 전송 시작을 알리는 메타데이터를 보냅니다.
    sendToAllPeers(JSON.stringify({ type: 'file-meta', payload: fileMeta }));

    try {
        // FileReader 대신, 파일을 청크 단위로 직접 읽는 루프를 사용합니다.
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            // 연결된 피어가 없으면 전송을 중단합니다.
            if (get().webRTCManager?.getConnectedPeerIds().length === 0) {
                console.warn("[FILE_TRANSFER] Connection lost. Aborting.");
                // 대기 중인 모든 ACK를 즉시 해결하여 루프를 종료합니다.
                get().pendingAcks.forEach(resolve => resolve());
                set(produce(state => { state.pendingAcks.clear(); }));
                return;
            }
            const offset = chunkIndex * FILE_CHUNK_SIZE;
            
            // 1. File.slice()로 메모리 부담 없이 파일 조각(Blob)을 가져옵니다.
            const chunkBlob = file.slice(offset, offset + FILE_CHUNK_SIZE);
            // 2. Blob을 ArrayBuffer로 변환합니다. 이 과정은 메모리에 큰 부담을 주지 않습니다.
            const chunkBuffer = await chunkBlob.arrayBuffer();

            // 청크 데이터 앞에 타입(1)과 인덱스 헤더를 붙입니다.
            const header = new ArrayBuffer(5);
            new DataView(header).setUint8(0, 1); // Type 1: Data Chunk
            new DataView(header).setUint32(1, chunkIndex);
            
            const combined = new Uint8Array(header.byteLength + chunkBuffer.byteLength);
            combined.set(new Uint8Array(header), 0);
            combined.set(new Uint8Array(chunkBuffer), header.byteLength);
            
            // 상대방의 ACK를 기다리는 Promise를 생성합니다.
            const ackPromise = new Promise<void>((resolve, reject) => {
                const key = `${transferId}-${chunkIndex}`;
                const timeoutId = setTimeout(() => {
                    reject(new Error(`ACK timeout for chunk ${chunkIndex}`));
                    set(produce(state => { state.pendingAcks.delete(key); }));
                }, 15000); // 15초 타임아웃

                // ACK를 받으면 호출될 resolve 함수를 저장합니다.
                set(produce(state => {
                    state.pendingAcks.set(key, () => {
                        clearTimeout(timeoutId);
                        resolve();
                    });
                }));
            });

            // 헤더가 포함된 청크를 전송합니다.
            sendToAllPeers(combined.buffer);
            
            // 이 청크에 대한 ACK가 올 때까지 기다립니다.
            await ackPromise;
            
            // 진행률을 업데이트합니다.
            updateFileProgress(transferId, offset + chunkBuffer.byteLength);
        }

        // 모든 청크 전송이 끝나면 종료 신호(타입 2)를 보냅니다.
        const endHeader = new ArrayBuffer(1);
        new DataView(endHeader).setUint8(0, 2); // Type 2: End of File
        sendToAllPeers(endHeader);
        console.log(`[FILE_TRANSFER] All chunks sent for: ${transferId}`);

    } catch (error) {
        console.error("[FILE_TRANSFER] Transfer failed:", error);
        // 여기에 전송 실패 UI 피드백 로직을 추가할 수 있습니다. (예: toast.error)
    }
  },
  
  cleanup: () => {
    get().webRTCManager?.destroyAll();
    set({ webRTCManager: null, peers: new Map(), pendingAcks: new Map() });
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