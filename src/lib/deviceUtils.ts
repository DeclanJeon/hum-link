/**
 * @fileoverview 디바이스 관리 유틸리티 - 순수 함수 모음
 * @module lib/deviceUtils
 */

/**
 * 디바이스 정보 인터페이스
 */
export interface DeviceInfo {
    deviceId: string;
    label: string;
    kind: MediaDeviceKind;
    groupId: string;
  }
  
  /**
   * 스트림 생성 옵션
   */
  export interface StreamConstraints {
    audioDeviceId?: string;
    videoDeviceId?: string;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  }
  
  /**
   * 디바이스 권한 상태
   */
  export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';
  
  /**
   * 디바이스 권한 체크
   * 
   * @returns 권한 상태 객체
   */
  export async function checkDevicePermissions(): Promise<{
    camera: PermissionState;
    microphone: PermissionState;
  }> {
    try {
      // Permissions API 지원 여부 확인
      if (!navigator.permissions) {
        return { camera: 'unknown', microphone: 'unknown' };
      }
  
      const [cameraPermission, microphonePermission] = await Promise.all([
        navigator.permissions.query({ name: 'camera' as PermissionName }),
        navigator.permissions.query({ name: 'microphone' as PermissionName })
      ]);
  
      return {
        camera: cameraPermission.state as PermissionState,
        microphone: microphonePermission.state as PermissionState
      };
    } catch (error) {
      console.warn('[DeviceUtils] Permission check failed:', error);
      return { camera: 'unknown', microphone: 'unknown' };
    }
  }
  
  /**
   * 디바이스 목록 가져오기 (권한 필요)
   * 
   * @returns 디바이스 정보 배열
   */
  export async function getDeviceList(): Promise<{
    audioInputs: DeviceInfo[];
    videoInputs: DeviceInfo[];
    audioOutputs: DeviceInfo[];
  }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      return {
        audioInputs: devices
          .filter(d => d.kind === 'audioinput' && d.deviceId)
          .map(normalizeDeviceInfo),
        videoInputs: devices
          .filter(d => d.kind === 'videoinput' && d.deviceId)
          .map(normalizeDeviceInfo),
        audioOutputs: devices
          .filter(d => d.kind === 'audiooutput' && d.deviceId)
          .map(normalizeDeviceInfo)
      };
    } catch (error) {
      console.error('[DeviceUtils] Failed to enumerate devices:', error);
      return { audioInputs: [], videoInputs: [], audioOutputs: [] };
    }
  }
  
  /**
   * 디바이스 정보 정규화
   */
  function normalizeDeviceInfo(device: MediaDeviceInfo): DeviceInfo {
    return {
      deviceId: device.deviceId,
      label: device.label || `${device.kind} ${device.deviceId.substring(0, 8)}`,
      kind: device.kind,
      groupId: device.groupId
    };
  }
  
  /**
   * 미디어 스트림 생성
   * 
   * @param constraints - 스트림 제약 조건
   * @returns 생성된 MediaStream
   */
  export async function createMediaStream(
    constraints: StreamConstraints
  ): Promise<MediaStream> {
    const {
      audioDeviceId,
      videoDeviceId,
      audioEnabled = true,
      videoEnabled = true
    } = constraints;
  
    try {
      const mediaConstraints: MediaStreamConstraints = {
        audio: audioEnabled && audioDeviceId
          ? { deviceId: { exact: audioDeviceId } }
          : audioEnabled,
        video: videoEnabled && videoDeviceId
          ? {
              deviceId: { exact: videoDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          : videoEnabled
            ? { width: { ideal: 1280 }, height: { ideal: 720 } }
            : false
      };
  
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      
      console.log('[DeviceUtils] Stream created:', {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioDevice: stream.getAudioTracks()[0]?.label,
        videoDevice: stream.getVideoTracks()[0]?.label
      });
  
      return stream;
    } catch (error) {
      console.error('[DeviceUtils] Failed to create stream:', error);
      throw error;
    }
  }
  
  /**
   * 더미 스트림 생성 (디바이스 없을 때)
   * 
   * @param includeVideo - 비디오 트랙 포함 여부
   * @param includeAudio - 오디오 트랙 포함 여부
   * @returns 더미 MediaStream
   */
  export function createDummyStream(
    includeVideo: boolean = true,
    includeAudio: boolean = true
  ): MediaStream {
    const stream = new MediaStream();
  
    if (includeVideo) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
  
      // 그라데이션 배경
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
  
      // 아이콘
      ctx.fillStyle = '#666';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Camera', canvas.width / 2, canvas.height / 2);
  
      const videoTrack = (canvas as any).captureStream(15).getVideoTracks()[0];
      stream.addTrack(videoTrack);
    }
  
    if (includeAudio) {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // 무음
      oscillator.connect(gainNode);
      const destination = audioContext.createMediaStreamDestination();
      gainNode.connect(destination);
      oscillator.start();
  
      stream.addTrack(destination.stream.getAudioTracks()[0]);
    }
  
    return stream;
  }
  
  /**
   * 스트림 정리
   * 
   * @param stream - 정리할 MediaStream
   */
  export function cleanupStream(stream: MediaStream | null): void {
    if (!stream) return;
  
    stream.getTracks().forEach(track => {
      track.stop();
      stream.removeTrack(track);
    });
  }
  
  /**
   * 트랙 활성화 상태 설정
   * 
   * @param stream - 대상 스트림
   * @param kind - 트랙 종류
   * @param enabled - 활성화 여부
   */
  export function setTrackEnabled(
    stream: MediaStream,
    kind: 'audio' | 'video',
    enabled: boolean
  ): void {
    const tracks = kind === 'audio' 
      ? stream.getAudioTracks() 
      : stream.getVideoTracks();
  
    tracks.forEach(track => {
      track.enabled = enabled;
    });
  }
  
  /**
   * 디바이스 ID 유효성 검증
   * 
   * @param deviceId - 검증할 디바이스 ID
   * @param devices - 사용 가능한 디바이스 목록
   * @returns 유효 여부
   */
  export function isValidDeviceId(
    deviceId: string,
    devices: DeviceInfo[]
  ): boolean {
    return devices.some(d => d.deviceId === deviceId);
  }
  
  /**
   * 첫 번째 사용 가능한 디바이스 ID 가져오기
   * 
   * @param devices - 디바이스 목록
   * @returns 디바이스 ID 또는 빈 문자열
   */
  export function getFirstDeviceId(devices: DeviceInfo[]): string {
    return devices[0]?.deviceId || '';
  }
  
  /**
   * localStorage에서 선호 디바이스 가져오기
   * 
   * @param key - localStorage 키
   * @returns 저장된 디바이스 ID
   */
  export function getPreferredDeviceId(key: string): string {
    return localStorage.getItem(key) || '';
  }
  
  /**
   * localStorage에 선호 디바이스 저장
   * 
   * @param key - localStorage 키
   * @param deviceId - 디바이스 ID
   */
  export function setPreferredDeviceId(key: string, deviceId: string): void {
    localStorage.setItem(key, deviceId);
  }
  
  /**
   * 모바일 디바이스 여부 확인
   * 
   * @returns 모바일 여부
   */
  export function isMobileDevice(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileKeywords = ['android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
    const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    return isMobileUA || (hasTouch && isSmallScreen);
  }
  
  /**
   * 카메라 facing mode 감지
   * 
   * @param track - 비디오 트랙
   * @returns facing mode
   */
  export function detectFacingMode(track: MediaStreamTrack): 'user' | 'environment' | 'unknown' {
    const settings = track.getSettings();
    const facingMode = settings.facingMode;
    
    if (facingMode === 'user' || facingMode === 'environment') {
      return facingMode;
    }
    
    const label = track.label.toLowerCase();
    if (label.includes('front') || label.includes('user')) {
      return 'user';
    }
    if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
      return 'environment';
    }
    
    return 'unknown';
  }
  