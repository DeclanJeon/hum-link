/// <reference lib="webworker" />
// [웹 워커] 파일 전송 작업을 전담할 웹 워커 스크립트입니다.
// 이 파일은 메인 UI 스레드와 독립적으로 실행됩니다.
declare const self: DedicatedWorkerGlobalScope;

const FILE_CHUNK_SIZE = 64 * 1024; // 64KB
let pendingAcks: Map<string, () => void> = new Map();

/**
 * 워커의 메인 이벤트 리스너입니다.
 * 메인 스레드로부터 메시지를 받아 파일 전송을 시작하거나 ACK를 처리합니다.
 */
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'start-transfer') {
    await handleStartTransfer(payload.file, payload.transferId);
  } else if (type === 'ack-received') {
    handleAckReceived(payload.transferId, payload.chunkIndex);
  }
};

/**
 * 'start-transfer' 메시지를 처리하여 파일 전송을 시작합니다.
 * @param file 전송할 파일 객체
 * @param transferId 이번 전송의 고유 ID
 */
async function handleStartTransfer(file: File, transferId: string) {
  const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const offset = chunkIndex * FILE_CHUNK_SIZE;
      const chunkBlob = file.slice(offset, offset + FILE_CHUNK_SIZE);
      const chunkBuffer = await chunkBlob.arrayBuffer();

      // 청크 데이터와 헤더(타입, 인덱스)를 결합합니다.
      const header = new ArrayBuffer(5);
      new DataView(header).setUint8(0, 1); // Type 1: Data Chunk
      new DataView(header).setUint32(1, chunkIndex);

      const combined = new Uint8Array(header.byteLength + chunkBuffer.byteLength);
      combined.set(new Uint8Array(header), 0);
      combined.set(new Uint8Array(chunkBuffer), header.byteLength);

      // ACK를 기다리는 Promise를 생성합니다.
      const ackPromise = new Promise<void>((resolve, reject) => {
        const key = `${transferId}-${chunkIndex}`;
        const timeoutId = setTimeout(() => {
          reject(new Error(`[Worker] ACK timeout for chunk ${chunkIndex}`));
          pendingAcks.delete(key);
        }, 15000); // 15초 타임아웃

        pendingAcks.set(key, () => {
          clearTimeout(timeoutId);
          resolve();
        });
      });

      // 메인 스레드로 청크를 보내 전송하도록 요청합니다. (Transferable Object로 성능 최적화)
      self.postMessage({ type: 'chunk-ready', payload: { transferId, chunk: combined.buffer } }, [combined.buffer]);

      // 해당 청크에 대한 ACK를 기다립니다.
      await ackPromise;

      // 메인 스레드로 진행 상황을 보고합니다.
      const loaded = offset + chunkBuffer.byteLength;
      self.postMessage({ type: 'progress-update', payload: { transferId, loaded } });
    }

    // 모든 청크 전송 완료 후 종료 신호를 보냅니다.
    const endHeader = new ArrayBuffer(1);
    new DataView(endHeader).setUint8(0, 2); // Type 2: End of File
    self.postMessage({ type: 'chunk-ready', payload: { transferId, chunk: endHeader } }, [endHeader]);

    // 메인 스레드에 전송 완료를 알립니다.
    self.postMessage({ type: 'transfer-complete', payload: { transferId } });

  } catch (error) {
    console.error(`[Worker] File transfer failed for ${transferId}:`, error);
    self.postMessage({ type: 'transfer-error', payload: { transferId, error: (error as Error).message } });
  } finally {
    // 모든 작업이 끝나면 워커를 스스로 종료합니다.
    self.close();
  }
}

/**
 * 메인 스레드로부터 받은 ACK를 처리하여 대기 중인 Promise를 resolve합니다.
 * @param transferId 전송 ID
 * @param chunkIndex ACK를 받은 청크의 인덱스
 */
function handleAckReceived(transferId: string, chunkIndex: number) {
  const key = `${transferId}-${chunkIndex}`;
  const resolve = pendingAcks.get(key);
  if (resolve) {
    resolve();
    pendingAcks.delete(key);
  }
}
