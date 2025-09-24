import { create } from 'zustand';
import { produce } from 'immer';
import { WebRTCManager } from '@/services/webrtc';
import type { SignalData } from 'simple-peer';
import { useSignalingStore } from './useSignalingStore';

// useChatStore의 순환 참조를 피하기 위해 동적으로 import 합니다.
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
  pendingAcks: Map<string, () => void>; // ACK를 기다리는 Promise의 resolve 함수들을 저장
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
    resolveAck: (transferId: string, chunkIndex: number) => void; // ACK 수신 시 호출될 액션
}

const FILE_CHUNK_SIZE = 64 * 1024;

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

  sendFile: async (file: File) => {
    const { webRTCManager, sendToAllPeers } = get();
    const { addFileMessage, updateFileProgress } = useChatStore.getState();

    if (!webRTCManager) { console.error("[FILE_TRANSFER] WebRTCManager is not initialized."); return; }
    if (!FileReader) { alert("Your browser does not support FileReader API needed for this transfer method."); return; }

    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);
    const transferId = `${file.name}-${file.size}-${Date.now()}`;
    const fileMeta = { transferId, name: file.name, size: file.size, type: file.type, totalChunks };

    await addFileMessage('local-user', 'You', fileMeta, true);
    sendToAllPeers(JSON.stringify({ type: 'file-meta', payload: fileMeta }));

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) return;

        try {
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                if (get().webRTCManager?.getConnectedPeerIds().length === 0) {
                    console.warn("[FILE_TRANSFER] Connection lost. Aborting.");
                    // 진행 중인 모든 ACK 대기 취소
                    get().pendingAcks.forEach(resolve => resolve());
                    set(produce(state => { state.pendingAcks.clear(); }));
                    return;
                }
                const offset = chunkIndex * FILE_CHUNK_SIZE;
                const chunk = buffer.slice(offset, offset + FILE_CHUNK_SIZE);

                const header = new ArrayBuffer(5);
                new DataView(header).setUint8(0, 1);
                new DataView(header).setUint32(1, chunkIndex);
                const combined = new Uint8Array(header.byteLength + chunk.byteLength);
                combined.set(new Uint8Array(header), 0);
                combined.set(new Uint8Array(chunk), header.byteLength);
                
                const ackPromise = new Promise<void>((resolve, reject) => {
                    const key = `${transferId}-${chunkIndex}`;
                    const timeoutId = setTimeout(() => {
                        reject(new Error(`ACK timeout for chunk ${chunkIndex}`));
                        set(produce(state => { state.pendingAcks.delete(key); }));
                    }, 15000);

                    set(produce(state => {
                        state.pendingAcks.set(key, () => {
                            clearTimeout(timeoutId);
                            resolve();
                        });
                    }));
                });

                sendToAllPeers(combined.buffer);
                
                await ackPromise;
                
                updateFileProgress(transferId, offset + chunk.byteLength);
            }

            const endHeader = new ArrayBuffer(1);
            new DataView(endHeader).setUint8(0, 2);
            sendToAllPeers(endHeader);
            console.log(`[FILE_TRANSFER] All chunks sent for: ${transferId}`);

        } catch (error) {
            console.error("[FILE_TRANSFER] Transfer failed:", error);
        }
    };
    reader.onerror = (error) => {
        console.error("[FILE_TRANSFER] FileReader error:", error);
    };
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
