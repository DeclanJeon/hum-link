/**
 * @fileoverview 파일 전송 관련 유틸리티 함수 모음
 * @module lib/fileTransferUtils
 * @description 청크 크기 계산, 유효성 검사, 진행률 및 속도 계산 등 파일 전송의
 *              코어 로직을 지원하는 순수 함수들을 제공합니다.
 */
import { getOptimalChunkSize } from './deviceDetector';

// DataChannel의 안전한 최대 메시지 크기 (SCTP 페이로드 한계 고려)
export const MAX_MESSAGE_SIZE = 16 * 1024; // 16KB

/**
 * 파일 크기와 장치 유형에 따라 최적의 청크 크기를 계산합니다.
 * iOS는 메모리 제약으로 작은 청크를 사용합니다.
 * @param {number} fileSize - 파일 전체 크기 (바이트)
 * @returns {number} 계산된 청크 크기 (바이트)
 */
export const calculateOptimalChunkSize = (fileSize: number): number => {
    const baseChunkSize = getOptimalChunkSize(); // iOS: 16KB, Others: 64KB

    // 파일 크기에 따른 동적 조정
    if (fileSize < 1 * 1024 * 1024) { // 1MB 미만
        return 16 * 1024;
    }
    if (fileSize < 100 * 1024 * 1024) { // 100MB 미만
        return baseChunkSize;
    }
    // 100MB 이상
    return 64 * 1024;
};

/**
 * 파일 크기가 유효한지 확인합니다.
 * @param {number} fileSize - 파일 크기 (바이트)
 * @param {number} [maxSize=4 * 1024 * 1024 * 1024] - 최대 허용 크기 (기본값 4GB)
 * @returns {boolean} 유효 여부
 */
export const isValidFileSize = (
    fileSize: number,
    maxSize: number = 4 * 1024 * 1024 * 1024
): boolean => {
    return fileSize > 0 && fileSize <= maxSize;
};

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환합니다. (e.g., 1.23 MB)
 * @param {number} bytes - 파일 크기 (바이트)
 * @returns {string} 변환된 문자열
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 청크 인덱스와 크기를 기반으로 파일 내 오프셋을 계산합니다.
 * @param {number} chunkIndex - 청크 인덱스
 * @param {number} chunkSize - 청크 크기
 * @returns {number} 파일 오프셋
 */
export const calculateFileOffset = (chunkIndex: number, chunkSize: number): number => {
    return chunkIndex * chunkSize;
};

/**
 * 전체 파일 크기와 청크 크기를 기반으로 총 청크 수를 계산합니다.
 * @param {number} fileSize - 파일 전체 크기
 * @param {number} chunkSize - 청크 크기
 * @returns {number} 총 청크 수
 */
export const calculateTotalChunks = (fileSize: number, chunkSize: number): number => {
    if (chunkSize <= 0) return 0;
    return Math.ceil(fileSize / chunkSize);
};

/**
 * 특정 청크의 실제 크기를 계산합니다. (마지막 청크는 더 작을 수 있음)
 * @param {number} fileSize - 파일 전체 크기
 * @param {number} chunkIndex - 청크 인덱스
 * @param {number} chunkSize - 기본 청크 크기
 * @returns {number} 해당 청크의 실제 크기
 */
export const calculateActualChunkSize = (
    fileSize: number,
    chunkIndex: number,
    chunkSize: number
): number => {
    const offset = calculateFileOffset(chunkIndex, chunkSize);
    const remaining = fileSize - offset;
    return Math.min(chunkSize, remaining);
};

/**
 * 진행률을 0과 1 사이의 값으로 계산합니다.
 * @param {number} completed - 완료된 항목 수
 * @param {number} total - 전체 항목 수
 * @returns {number} 진행률 (0-1)
 */
export const calculateProgress = (
    completed: number,
    total: number
): number => {
    if (total === 0) return 0;
    return Math.min(1, completed / total);
};

/**
 * 전송 속도를 바이트/초 단위로 계산합니다.
 * @param {number} bytesTransferred - 전송된 바이트
 * @param {number} startTime - 시작 시간 (timestamp)
 * @param {number} [currentTime=Date.now()] - 현재 시간 (timestamp)
 * @returns {number} 전송 속도 (bytes/sec)
 */
export const calculateTransferSpeed = (
    bytesTransferred: number,
    startTime: number,
    currentTime: number = Date.now()
): number => {
    const elapsedSeconds = (currentTime - startTime) / 1000;
    if (elapsedSeconds <= 0) return 0;
    return bytesTransferred / elapsedSeconds;
};

/**
 * 남은 예상 시간(ETA)을 초 단위로 계산합니다.
 * @param {number} bytesRemaining - 남은 바이트
 * @param {number} currentSpeed - 현재 전송 속도 (bytes/sec)
 * @returns {number} ETA (초)
 */
export const calculateETA = (
    bytesRemaining: number,
    currentSpeed: number
): number => {
    if (currentSpeed === 0) return Infinity;
    return bytesRemaining / currentSpeed;
};

/**
 * ETA(초)를 사람이 읽기 쉬운 형식으로 변환합니다. (e.g., 1m 23s)
 * @param {number} seconds - ETA (초)
 * @returns {string} 변환된 문자열
 */
export const formatETA = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '--';

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

/**
 * 전송 속도를 사람이 읽기 쉬운 형식으로 변환합니다. (e.g., 1.5 MB/s)
 * @param {number} bytesPerSecond - 전송 속도 (bytes/sec)
 * @returns {string} 변환된 문자열
 */
export const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatFileSize(bytesPerSecond)}/s`;
};

/**
 * 청크 인덱스가 유효 범위 내에 있는지 확인합니다.
 * @param {number} chunkIndex - 확인할 청크 인덱스
 * @param {number} totalChunks - 전체 청크 수
 * @returns {boolean} 유효 여부
 */
export const isValidChunkIndex = (
    chunkIndex: number,
    totalChunks: number
): boolean => {
    return chunkIndex >= 0 && chunkIndex < totalChunks;
};

/**
 * 보안상 위험할 수 있는 파일 타입을 차단합니다.
 * @param {File} file - 검사할 파일 객체
 * @returns {boolean} 유효 여부
 */
export const isValidFileType = (file: File): boolean => {
    const dangerousTypes = [
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-executable',
        'application/x-sharedlib',
        'application/javascript', // 스크립트 파일 차단
        'text/html', // HTML 파일 차단
    ];

    if (dangerousTypes.includes(file.type)) {
        return false;
    }
    // 파일 확장자로도 검사 (MIME 타입이 부정확할 경우 대비)
    const dangerousExtensions = ['.exe', '.dll', '.bat', '.sh', '.js', '.html', '.htm'];
    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (dangerousExtensions.includes(extension)) {
        return false;
    }

    return true;
};
