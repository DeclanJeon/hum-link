const DB_NAME = 'FileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

let db: IDBDatabase | null = null;
let dbInitPromise: Promise<void> | null = null;

export const initDB = async (): Promise<void> => {
  if (db) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInitPromise = null;
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('[IndexedDB] Database initialized successfully');
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME);
        // 복합 인덱스 생성 (transferId + chunkIndex)
        store.createIndex('transfer', ['transferId', 'chunkIndex'], { unique: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });

  return dbInitPromise;
};

export const saveChunk = async (
  transferId: string,
  chunkIndex: number,
  data: ArrayBuffer
): Promise<void> => {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const key = `${transferId}_${chunkIndex}`;
    const request = store.put({
      transferId,
      chunkIndex,
      data,
      timestamp: Date.now()
    }, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAndAssembleFile = async (
  transferId: string,
  mimeType: string
): Promise<Blob | null> => {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    // transferId로 시작하는 모든 키 가져오기
    const keyRange = IDBKeyRange.bound(
      `${transferId}_`,
      `${transferId}_\uffff`
    );
    
    const request = store.getAll(keyRange);

    request.onsuccess = () => {
      try {
        const chunks = request.result;
        if (!chunks || chunks.length === 0) {
          console.error(`[IndexedDB] No chunks found for ${transferId}`);
          resolve(null);
          return;
        }

        // 청크 정렬
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        console.log(`[IndexedDB] Assembling ${chunks.length} chunks for ${transferId}`);

        // 스트리밍 방식으로 Blob 생성 (메모리 효율적)
        const blobParts: (ArrayBuffer | Blob)[] = [];
        let totalSize = 0;
        
        for (const chunk of chunks) {
          if (chunk.data instanceof ArrayBuffer) {
            blobParts.push(chunk.data);
            totalSize += chunk.data.byteLength;
            
            // 메모리 압박 방지: 100MB마다 중간 Blob 생성
            if (totalSize > 100 * 1024 * 1024) {
              const intermediateBlob = new Blob(blobParts, { type: mimeType });
              blobParts.length = 0;
              blobParts.push(intermediateBlob);
              totalSize = 0;
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

    request.onerror = () => reject(request.error);
  });
};

export const deleteFileChunks = async (transferId: string): Promise<void> => {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // transferId로 시작하는 모든 키 가져오기
    const keyRange = IDBKeyRange.bound(
      `${transferId}_`,
      `${transferId}_\uffff`
    );
    
    // 먼저 모든 관련 키를 가져옴
    const getAllRequest = store.getAllKeys(keyRange);
    
    getAllRequest.onsuccess = () => {
      const keys = getAllRequest.result;
      let deletedCount = 0;
      
      if (keys.length === 0) {
        console.log(`[IndexedDB] No chunks to delete for ${transferId}`);
        resolve();
        return;
      }
      
      // 각 키를 개별적으로 삭제
      keys.forEach(key => {
        const deleteRequest = store.delete(key);
        deleteRequest.onsuccess = () => {
          deletedCount++;
          if (deletedCount === keys.length) {
            console.log(`[IndexedDB] Deleted ${deletedCount} chunks for ${transferId}`);
            resolve();
          }
        };
        deleteRequest.onerror = () => {
          console.error(`[IndexedDB] Failed to delete chunk with key: ${key}`);
        };
      });
    };
    
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
};

// 오래된 청크 정리 (24시간 이상)
export const cleanupOldChunks = async (): Promise<void> => {
  if (!db) await initDB();

  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(oneDayAgo, true);
    const request = index.openCursor(range);

    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        console.log(`[IndexedDB] Cleaned up ${deletedCount} old chunks`);
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
};

// DB 연결 상태 확인
export const isDBReady = (): boolean => {
  return db !== null;
};

// DB 연결 종료
export const closeDB = (): void => {
  if (db) {
    db.close();
    db = null;
    dbInitPromise = null;
    console.log('[IndexedDB] Database connection closed');
  }
};