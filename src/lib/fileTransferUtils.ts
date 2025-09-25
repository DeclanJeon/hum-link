/**
 * 파일 전송 관련 유틸리티 함수들
 */

// DataChannel의 최대 메시지 크기 (보수적으로 설정)
const MAX_MESSAGE_SIZE = 16 * 1024; // 16KB - DataChannel의 안전한 크기
const MAX_CHUNK_SIZE = 64 * 1024; // 64KB - 최대 청크 크기 제한

// 파일 크기에 따른 최적 청크 크기 계산 (64KB 제한)
// 파일 크기별 청크 크기 최적화
export const calculateOptimalChunkSize = (fileSize: number): number => {
  // 매우 작은 파일 (< 100KB): 16KB 청크
  if (fileSize < 100 * 1024) {
    return 16 * 1024;
  }
  // 작은 파일 (< 1MB): 32KB 청크
  if (fileSize < 1024 * 1024) {
    return 32 * 1024;
  }
  // 중간 파일 (< 10MB): 64KB 청크
  if (fileSize < 10 * 1024 * 1024) {
    return 64 * 1024;
  }
  return MAX_CHUNK_SIZE;
};

// 파일 크기 제한 (1GB)
export const isValidFileSize = (
  fileSize: number,
  maxSize: number = 1024 * 1024 * 1024 * 50
): boolean => {
  return fileSize > 0 && fileSize <= maxSize;
};

// 파일 크기 포맷팅
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 네트워크 상태에 따른 청크 크기 조정 (향후 확장용)
export const adjustChunkSizeForNetwork = (
  baseChunkSize: number,
  rtt?: number,
  packetLoss?: number
): number => {
  // RTT가 높으면 청크 크기를 줄임
  if (rtt && rtt > 200) {
    return Math.max(16 * 1024, Math.min(baseChunkSize / 2, MAX_CHUNK_SIZE));
  }
  
  // 패킷 손실이 높으면 청크 크기를 줄임
  if (packetLoss && packetLoss > 0.05) {
    return Math.max(16 * 1024, Math.min(baseChunkSize / 2, MAX_CHUNK_SIZE));
  }
  
  return Math.min(baseChunkSize, MAX_CHUNK_SIZE);
};

// 청크 인덱스와 크기로 파일 오프셋 계산
export const calculateFileOffset = (chunkIndex: number, chunkSize: number): number => {
  return chunkIndex * chunkSize;
};

// 총 청크 개수 계산
export const calculateTotalChunks = (fileSize: number, chunkSize: number): number => {
  return Math.ceil(fileSize / chunkSize);
};

// 현재 청크의 실제 크기 계산 (마지막 청크는 작을 수 있음)
export const calculateActualChunkSize = (
  fileSize: number,
  chunkIndex: number,
  chunkSize: number
): number => {
  const offset = calculateFileOffset(chunkIndex, chunkSize);
  const remaining = fileSize - offset;
  return Math.min(chunkSize, remaining);
};

// 진행률 계산 (0-1 사이의 값)
export const calculateProgress = (
  completedChunks: number,
  totalChunks: number
): number => {
  if (totalChunks === 0) return 0;
  return Math.min(1, completedChunks / totalChunks);
};

// 바이트를 읽기 쉬운 형식으로 변환
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 전송 속도 계산 (bytes/sec)
export const calculateTransferSpeed = (
  bytesTransferred: number,
  startTime: number,
  currentTime: number = Date.now()
): number => {
  const elapsedSeconds = (currentTime - startTime) / 1000;
  if (elapsedSeconds === 0) return 0;
  return bytesTransferred / elapsedSeconds;
};

// 예상 남은 시간 계산 (초)
export const calculateETA = (
  bytesRemaining: number,
  currentSpeed: number
): number => {
  if (currentSpeed === 0) return Infinity;
  return bytesRemaining / currentSpeed;
};

// ETA를 읽기 쉬운 형식으로 변환
export const formatETA = (seconds: number): string => {
  if (!isFinite(seconds)) return 'Unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

// 전송 속도를 읽기 쉬운 형식으로 변환
export const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatBytes(bytesPerSecond)}/s`;
};

// 청크 인덱스 유효성 검증
export const isValidChunkIndex = (
  chunkIndex: number,
  totalChunks: number
): boolean => {
  return chunkIndex >= 0 && chunkIndex < totalChunks;
};

// 파일 타입 검증
export const isValidFileType = (file: File): boolean => {
  // 실행 파일 등 위험한 파일 타입 차단
  const dangerousTypes = [
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable',
    'application/x-sharedlib',
  ];
  
  return !dangerousTypes.includes(file.type);
};
