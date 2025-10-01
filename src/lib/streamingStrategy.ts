/**
 * @fileoverview 스트리밍 전략 선택 로직
 * @module lib/streamingStrategy
 */

import {
    isIOS,
    getIOSVersion,
    supportsMediaRecorder,
    supportsCaptureStream,
    estimateDevicePerformance,
    estimateNetworkQuality
  } from './deviceDetector';
  
  /**
   * 스트리밍 전략 타입
   */
  export type StreamingStrategy = 
    | 'mediarecorder'    // MediaRecorder API 사용
    | 'capturestream'    // HTMLVideoElement.captureStream() 사용
    | 'canvas';          // Canvas 기반 폴백
  
  /**
   * 전략 선택 결과
   */
  export interface StrategySelection {
    strategy: StreamingStrategy;
    reason: string;
    fallbacks: StreamingStrategy[];
    config: StreamingConfig;
  }
  
  /**
   * 스트리밍 설정
   */
  export interface StreamingConfig {
    fps: number;
    videoBitsPerSecond: number;
    audioBitsPerSecond: number;
    chunkSize: number;
    timeslice: number; // MediaRecorder용
    mimeType?: string;
  }
  
  /**
   * 최적 스트리밍 전략 선택
   */
  export const selectStreamingStrategy = (): StrategySelection => {
    const devicePerf = estimateDevicePerformance();
    const networkQuality = estimateNetworkQuality();
    
    // iOS 디바이스 처리
    if (isIOS()) {
      return selectIOSStrategy(devicePerf, networkQuality);
    }
    
    // 데스크톱/안드로이드 처리
    return selectDesktopStrategy(devicePerf, networkQuality);
  };
  
  /**
   * iOS 전용 전략 선택
   */
  const selectIOSStrategy = (
    devicePerf: ReturnType<typeof estimateDevicePerformance>,
    networkQuality: ReturnType<typeof estimateNetworkQuality>
  ): StrategySelection => {
    const iosVersion = getIOSVersion();
    
    // iOS 14.3+ : MediaRecorder 우선
    if (supportsMediaRecorder()) {
      return {
        strategy: 'mediarecorder',
        reason: 'iOS 14.3+ with MediaRecorder support',
        fallbacks: ['capturestream', 'canvas'],
        config: getMediaRecorderConfig(devicePerf, networkQuality, true)
      };
    }
    
    // iOS 15+ : captureStream 시도
    if (iosVersion && iosVersion >= 15 && supportsCaptureStream()) {
      return {
        strategy: 'capturestream',
        reason: 'iOS 15+ with captureStream support',
        fallbacks: ['canvas'],
        config: getCaptureStreamConfig(devicePerf, networkQuality, true)
      };
    }
    
    // iOS < 14.3 : Canvas 폴백
    return {
      strategy: 'canvas',
      reason: 'iOS < 14.3 - using Canvas fallback',
      fallbacks: [],
      config: getCanvasConfig(devicePerf, networkQuality, true)
    };
  };
  
  /**
   * 데스크톱/안드로이드 전략 선택
   */
  const selectDesktopStrategy = (
    devicePerf: ReturnType<typeof estimateDevicePerformance>,
    networkQuality: ReturnType<typeof estimateNetworkQuality>
  ): StrategySelection => {
    // captureStream 우선 (성능 최적)
    if (supportsCaptureStream()) {
      return {
        strategy: 'capturestream',
        reason: 'Desktop/Android with captureStream support',
        fallbacks: ['canvas'],
        config: getCaptureStreamConfig(devicePerf, networkQuality, false)
      };
    }
    
    // Canvas 폴백
    return {
      strategy: 'canvas',
      reason: 'Using Canvas fallback',
      fallbacks: [],
      config: getCanvasConfig(devicePerf, networkQuality, false)
    };
  };
  
  /**
   * MediaRecorder 설정 생성
   */
  const getMediaRecorderConfig = (
    devicePerf: ReturnType<typeof estimateDevicePerformance>,
    networkQuality: ReturnType<typeof estimateNetworkQuality>,
    isIOSDevice: boolean
  ): StreamingConfig => {
    let fps = 30;
    let videoBitsPerSecond = 2500000; // 2.5 Mbps
    let audioBitsPerSecond = 128000;  // 128 Kbps
    let timeslice = 250; // ms
    
    // 디바이스 성능에 따른 조정
    if (devicePerf === 'low') {
      fps = 15;
      videoBitsPerSecond = 1000000; // 1 Mbps
      timeslice = 500;
    } else if (devicePerf === 'medium') {
      fps = 24;
      videoBitsPerSecond = 1500000; // 1.5 Mbps
      timeslice = 333;
    }
    
    // 네트워크 품질에 따른 조정
    if (networkQuality === 'poor') {
      videoBitsPerSecond = Math.floor(videoBitsPerSecond * 0.5);
      audioBitsPerSecond = 64000;
    } else if (networkQuality === 'moderate') {
      videoBitsPerSecond = Math.floor(videoBitsPerSecond * 0.75);
    }
    
    // iOS는 더 보수적인 설정
    if (isIOSDevice) {
      fps = Math.min(fps, 24);
      videoBitsPerSecond = Math.floor(videoBitsPerSecond * 0.8);
      timeslice = Math.max(timeslice, 250);
    }
    
    return {
      fps,
      videoBitsPerSecond,
      audioBitsPerSecond,
      chunkSize: isIOSDevice ? 16 * 1024 : 64 * 1024,
      timeslice,
      mimeType: 'video/webm;codecs=h264'
    };
  };
  
  /**
   * captureStream 설정 생성
   */
  const getCaptureStreamConfig = (
    devicePerf: ReturnType<typeof estimateDevicePerformance>,
    networkQuality: ReturnType<typeof estimateNetworkQuality>,
    isIOSDevice: boolean
  ): StreamingConfig => {
    let fps = 30;
    
    if (devicePerf === 'low') {
      fps = 15;
    } else if (devicePerf === 'medium') {
      fps = 24;
    }
    
    // iOS는 더 낮은 FPS
    if (isIOSDevice) {
      fps = Math.min(fps, 20);
    }
    
    return {
      fps,
      videoBitsPerSecond: 0, // captureStream은 비트레이트 제어 없음
      audioBitsPerSecond: 0,
      chunkSize: isIOSDevice ? 16 * 1024 : 64 * 1024,
      timeslice: 0
    };
  };
  
  /**
   * Canvas 설정 생성
   */
  const getCanvasConfig = (
    devicePerf: ReturnType<typeof estimateDevicePerformance>,
    networkQuality: ReturnType<typeof estimateNetworkQuality>,
    isIOSDevice: boolean
  ): StreamingConfig => {
    let fps = 24;
    
    if (devicePerf === 'low') {
      fps = 12;
    } else if (devicePerf === 'medium') {
      fps = 18;
    }
    
    // iOS는 Canvas 성능이 낮음
    if (isIOSDevice) {
      fps = Math.min(fps, 15);
    }
    
    return {
      fps,
      videoBitsPerSecond: 0,
      audioBitsPerSecond: 0,
      chunkSize: isIOSDevice ? 16 * 1024 : 64 * 1024,
      timeslice: 0
    };
  };
  
  /**
   * 전략 설명 텍스트 생성
   */
  export const getStrategyDescription = (selection: StrategySelection): string => {
    const { strategy, reason, config } = selection;
    
    const descriptions = {
      mediarecorder: `MediaRecorder API를 사용합니다 (${config.fps}fps, ${(config.videoBitsPerSecond / 1000000).toFixed(1)}Mbps). iOS Safari 14.3+ 최적화`,
      capturestream: `Video captureStream API를 사용합니다 (${config.fps}fps). 하드웨어 가속 지원`,
      canvas: `Canvas 기반 폴백을 사용합니다 (${config.fps}fps). 호환성 우선`
    };
    
    return `${descriptions[strategy]}\n이유: ${reason}`;
  };
  