import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'hum-link-file-storage';
const STORE_NAME = 'file_chunks';
let db: IDBPDatabase;

/**
 * 데이터베이스를 초기화하고 Object Store를 생성합니다.
 * 데이터베이스 버전을 올려 스키마 업그레이드를 강제합니다.
 */
export async function initDB(): Promise<void> {
  if (db) return;
  // <<< [핵심 수정 1] 데이터베이스 버전을 2로 올립니다.
  db = await openDB(DB_NAME, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[IndexedDB] Upgrading from version ${oldVersion} to ${newVersion}`);
      // <<< [핵심 수정 2] 기존 Object Store가 있다면 삭제하고 새로 만듭니다.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      // autoIncrement를 사용하지 않고 복합 키를 직접 제공할 것이므로 keyPath를 설정하지 않습니다.
      // 이것이 "out-of-line keys" 방식입니다.
      db.createObjectStore(STORE_NAME);
    },
  });
  console.log('[IndexedDB] Database initialized successfully.');
}

/**
 * 파일 청크를 IndexedDB에 저장합니다. (out-of-line key 방식)
 * @param transferId 파일 전송의 고유 ID
 * @param index 청크의 순서 인덱스
 * @param data 청크 데이터 (ArrayBuffer)
 */
export async function saveChunk(transferId: string, index: number, data: ArrayBuffer): Promise<void> {
  await initDB();
  
  // <<< [핵심 수정 3] 키의 유효성을 검증하는 방어 코드 추가
  if (typeof transferId !== 'string' || transferId.length === 0) {
    throw new Error(`[IndexedDB] Invalid key: transferId is not a valid string.`);
  }
  if (typeof index !== 'number' || isNaN(index)) {
    throw new Error(`[IndexedDB] Invalid key: index is not a number.`);
  }

  // <<< [핵심 수정 4] 데이터와 키를 명시적으로 분리하여 전달합니다.
  await db.put(STORE_NAME, data, [transferId, index]);
}

/**
 * 특정 전송 ID에 해당하는 모든 청크를 가져와 완전한 Blob 파일로 조립합니다.
 * @param transferId 파일 전송의 고유 ID
 * @param fileType 파일의 MIME 타입
 * @returns 조립된 Blob 객체 또는 null
 */
export async function getAndAssembleFile(transferId: string, fileType: string): Promise<Blob | null> {
  await initDB();
  const chunks = await db.getAll(STORE_NAME, IDBKeyRange.bound([transferId, 0], [transferId, Infinity]));
  if (chunks.length === 0) {
    console.warn(`[IndexedDB] No chunks found for transferId: ${transferId}`);
    return null;
  }
  console.log(`[IndexedDB] Assembling ${chunks.length} chunks for ${transferId}`);
  // <<< 수정 없음 (이전과 동일)
  return new Blob(chunks, { type: fileType });
}

/**
 * 특정 전송 ID와 관련된 모든 청크를 데이터베이스에서 삭제합니다.
 * @param transferId 정리할 파일 전송의 고유 ID
 */
export async function deleteFileChunks(transferId: string): Promise<void> {
  await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.delete(IDBKeyRange.bound([transferId, 0], [transferId, Infinity]));
  await tx.done;
  console.log(`[IndexedDB] Cleaned up chunks for transferId: ${transferId}`);
}
