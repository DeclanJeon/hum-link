/**
 * @fileoverview IndexedDB Helper - 파일 청크의 영구 저장을 위한 스토리지 계층
 * @module lib/indexedDBHelper
 * @description 대용량 파일 전송 시 메모리 부담을 줄이고, 브라우저가 종료되어도
 *              수신된 데이터를 보존하기 위해 IndexedDB를 사용합니다.
 */

const DB_NAME = 'PonsLinkFileTransfer';
const DB_VERSION = 1;
const CHUNK_STORE_NAME = 'file_chunks';

let db: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * IndexedDB 데이터베이스를 초기화합니다.
 * @returns {Promise<IDBDatabase>} 초기화된 DB 인스턴스
 */
export const initDB = (): Promise<IDBDatabase> => {
  if (db) return Promise.resolve(db);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Database initialization failed:', request.error);
      dbInitPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[IndexedDB] Database initialized successfully.');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(CHUNK_STORE_NAME)) {
        const store = database.createObjectStore(CHUNK_STORE_NAME, { keyPath: 'key' });
        // 전송 ID와 청크 인덱스를 기반으로 복합 인덱스 생성
        store.createIndex('transfer_chunk_idx', ['transferId', 'chunkIndex'], { unique: true });
        store.createIndex('timestamp_idx', 'timestamp', { unique: false });
        console.log('[IndexedDB] Object store created.');
      }
    };
  });

  return dbInitPromise;
};

/**
 * 단일 파일 청크를 IndexedDB에 저장합니다.
 * @param {string} transferId - 전송의 고유 ID
 * @param {number} chunkIndex - 청크의 인덱스
 * @param {ArrayBuffer} data - 청크의 바이너리 데이터
 * @returns {Promise<void>}
 */
export const saveChunk = async (
  transferId: string,
  chunkIndex: number,
  data: ArrayBuffer
): Promise<void> => {
  const dbInstance = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CHUNK_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHUNK_STORE_NAME);
    const key = `${transferId}_${chunkIndex}`;
    const request = store.put({
      key,
      transferId,
      chunkIndex,
      data,
      timestamp: Date.now()
    });

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error(`[IndexedDB] Failed to save chunk ${chunkIndex} for ${transferId}:`, request.error);
      reject(request.error);
    };
  });
};

/**
 * 특정 전송 ID에 해당하는 모든 청크를 조회하고 하나의 Blob으로 조립합니다.
 * 메모리 효율을 위해 100MB 단위로 중간 Blob을 생성하여 병합합니다.
 * @param {string} transferId - 전송의 고유 ID
 * @param {string} mimeType - 파일의 MIME 타입
 * @returns {Promise<Blob | null>} 조립된 파일 Blob 또는 null
 */
export const getAndAssembleFile = async (
  transferId: string,
  mimeType: string
): Promise<Blob | null> => {
  const dbInstance = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CHUNK_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CHUNK_STORE_NAME);
    const index = store.index('transfer_chunk_idx');
    const keyRange = IDBKeyRange.bound([transferId, 0], [transferId, Infinity]);
    const request = index.getAll(keyRange);

    request.onsuccess = () => {
      try {
        const chunks = request.result;
        if (!chunks || chunks.length === 0) {
          console.error(`[IndexedDB] No chunks found for transferId: ${transferId}`);
          resolve(null);
          return;
        }

        // 청크 인덱스 순서로 정렬
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        console.log(`[IndexedDB] Assembling ${chunks.length} chunks for ${transferId}`);

        // 메모리 효율적 조립 전략
        const blobParts: (ArrayBuffer | Blob)[] = [];
        let intermediateSize = 0;
        const INTERMEDIATE_BLOB_THRESHOLD = 100 * 1024 * 1024; // 100MB

        for (const chunk of chunks) {
          if (chunk.data instanceof ArrayBuffer) {
            blobParts.push(chunk.data);
            intermediateSize += chunk.data.byteLength;

            // 100MB를 초과하면 중간 Blob을 생성하여 메모리 사용량을 줄임
            if (intermediateSize > INTERMEDIATE_BLOB_THRESHOLD) {
              const intermediateBlob = new Blob(blobParts, { type: mimeType });
              blobParts.length = 0; // 배열 비우기
              blobParts.push(intermediateBlob);
              intermediateSize = 0;
            }
          }
        }

        const finalBlob = new Blob(blobParts, { type: mimeType });
        console.log(`[IndexedDB] File assembled: size=${finalBlob.size}`);
        resolve(finalBlob);

      } catch (error) {
        console.error('[IndexedDB] Assembly error:', error);
        reject(error);
      }
    };

    request.onerror = () => {
      console.error(`[IndexedDB] Failed to get chunks for ${transferId}:`, request.error);
      reject(request.error);
    };
  });
};

/**
 * 특정 전송 ID와 관련된 모든 청크를 DB에서 삭제합니다.
 * @param {string} transferId - 삭제할 전송의 고유 ID
 * @returns {Promise<void>}
 */
export const deleteFileChunks = async (transferId: string): Promise<void> => {
  const dbInstance = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([CHUNK_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHUNK_STORE_NAME);
    const index = store.index('transfer_chunk_idx');
    const keyRange = IDBKeyRange.bound([transferId, 0], [transferId, Infinity]);

    const cursorRequest = index.openKeyCursor(keyRange);
    let deleteCount = 0;

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursor>).result;
      if (cursor) {
        // 커서의 primaryKey를 사용하여 삭제 요청
        store.delete(cursor.primaryKey);
        deleteCount++;
        cursor.continue();
      } else {
        if (deleteCount > 0) {
          console.log(`[IndexedDB] Deleted ${deleteCount} chunks for ${transferId}`);
        }
        resolve();
      }
    };
    cursorRequest.onerror = () => {
      console.error(`[IndexedDB] Failed to delete chunks for ${transferId}:`, cursorRequest.error);
      reject(cursorRequest.error);
    };
  });
};
