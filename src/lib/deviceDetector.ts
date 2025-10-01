/**
 * @fileoverview 디바이스 감지 및 기능 지원 확인 유틸리티
 * @module lib/deviceDetector
 */

/**
 * iOS 디바이스 여부 확인
 * iPhone, iPad, iPod 및 iPad Pro (터치 지원 Mac) 감지
 */
export const isIOS = (): boolean => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    
    // iPad Pro는 MacIntel로 보고되지만 터치 지원
    const isIPadPro = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    
    return isIOSDevice || isIPadPro;
  };
  
  /**
   * iOS 버전 확인
   * @returns iOS 메이저 버전 번호 또는 null (iOS가 아닌 경우)
   */
  export const getIOSVersion = (): number | null => {
    if (!isIOS()) return null;
    
    const match = navigator.userAgent.match(/OS (\d+)_/);
    return match ? parseInt(match[1], 10) : null;
  };
  
  /**
   * Safari 브라우저 여부 확인
   */
  export const isSafari = (): boolean => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
  };
  
  /**
   * MediaRecorder API 지원 여부 확인
   * iOS Safari는 14.3부터 지원
   */
  export const supportsMediaRecorder = (): boolean => {
    if (typeof MediaRecorder === 'undefined') {
      return false;
    }
    
    // H.264 코덱 지원 확인 (iOS Safari 필수)
    try {
      return MediaRecorder.isTypeSupported('video/webm;codecs=h264') ||
             MediaRecorder.isTypeSupported('video/mp4;codecs=h264');
    } catch (e) {
      return false;
    }
  };
  
  /**
   * captureStream API 지원 여부 확인
   * iOS Safari는 15부터 부분 지원
   */
  export const supportsCaptureStream = (): boolean => {
    const video = document.createElement('video');
    return typeof (video as any).captureStream === 'function' ||
           typeof (video as any).mozCaptureStream === 'function';
  };
  
  /**
   * 최적 MIME 타입 선택
   * iOS Safari는 특정 코덱만 지원
   */
  export const getOptimalMimeType = (): string => {
    const candidates = [
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=h264',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm'
    ];
    
    for (const mimeType of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          return mimeType;
        }
      } catch (e) {
        continue;
      }
    }
    
    return 'video/webm'; // 기본값
  };
  
  /**
   * 최적 청크 크기 계산
   * iOS는 작은 청크 크기가 더 안정적
   */
  export const getOptimalChunkSize = (): number => {
    if (isIOS()) {
      return 16 * 1024; // 16KB for iOS
    }
    return 64 * 1024; // 64KB for others
  };
  
  /**
   * 디바이스 성능 등급 추정
   */
  export type DevicePerformance = 'high' | 'medium' | 'low';
  
  export const estimateDevicePerformance = (): DevicePerformance => {
    // CPU 코어 수 확인
    const cores = navigator.hardwareConcurrency || 2;
    
    // 메모리 확인 (Chrome/Edge만 지원)
    const memory = (navigator as any).deviceMemory;
    
    if (isIOS()) {
      const version = getIOSVersion();
      if (version && version >= 15) return 'high';
      if (version && version >= 13) return 'medium';
      return 'low';
    }
    
    if (cores >= 8 && memory >= 8) return 'high';
    if (cores >= 4 && memory >= 4) return 'medium';
    return 'low';
  };
  
  /**
   * 네트워크 품질 추정
   */
  export type NetworkQuality = 'excellent' | 'good' | 'moderate' | 'poor';
  
  export const estimateNetworkQuality = (): NetworkQuality => {
    const connection = (navigator as any).connection || 
                       (navigator as any).mozConnection || 
                       (navigator as any).webkitConnection;
    
    if (!connection) return 'moderate';
    
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink; // Mbps
    
    if (effectiveType === '4g' && downlink > 10) return 'excellent';
    if (effectiveType === '4g' || downlink > 5) return 'good';
    if (effectiveType === '3g' || downlink > 1) return 'moderate';
    return 'poor';
  };
  
  /**
   * 배터리 상태 확인 (가능한 경우)
   */
  export const getBatteryLevel = async (): Promise<number | null> => {
    try {
      const battery = await (navigator as any).getBattery?.();
      return battery ? battery.level : null;
    } catch (e) {
      return null;
    }
  };
  
  /**
   * 저전력 모드 여부 확인 (추정)
   */
  export const isLowPowerMode = async (): Promise<boolean> => {
    const batteryLevel = await getBatteryLevel();
    return batteryLevel !== null && batteryLevel < 0.2;
  };
  
  /**
   * 디바이스 정보 요약
   */
  export interface DeviceInfo {
    isIOS: boolean;
    iosVersion: number | null;
    isSafari: boolean;
    supportsMediaRecorder: boolean;
    supportsCaptureStream: boolean;
    optimalMimeType: string;
    optimalChunkSize: number;
    performance: DevicePerformance;
    networkQuality: NetworkQuality;
  }
  
  export const getDeviceInfo = (): DeviceInfo => {
    return {
      isIOS: isIOS(),
      iosVersion: getIOSVersion(),
      isSafari: isSafari(),
      supportsMediaRecorder: supportsMediaRecorder(),
      supportsCaptureStream: supportsCaptureStream(),
      optimalMimeType: getOptimalMimeType(),
      optimalChunkSize: getOptimalChunkSize(),
      performance: estimateDevicePerformance(),
      networkQuality: estimateNetworkQuality()
    };
  };
  