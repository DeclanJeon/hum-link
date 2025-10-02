/**
 * @fileoverview 디바이스 관리 서비스 - 중앙 집중식 디바이스 관리
 * @module services/deviceManager
 */

import {
    DeviceInfo,
    StreamConstraints,
    checkDevicePermissions,
    getDeviceList,
    createMediaStream,
    createDummyStream,
    cleanupStream,
    isValidDeviceId,
    getFirstDeviceId,
    getPreferredDeviceId,
    setPreferredDeviceId,
    isMobileDevice
  } from '@/lib/deviceUtils';
  import { toast } from 'sonner';
  
  /**
   * 디바이스 매니저 싱글톤 클래스
   */
  export class DeviceManager {
    private static instance: DeviceManager;
    
    private currentStream: MediaStream | null = null;
    private audioInputs: DeviceInfo[] = [];
    private videoInputs: DeviceInfo[] = [];
    private audioOutputs: DeviceInfo[] = [];
    
    private selectedAudioDeviceId: string = '';
    private selectedVideoDeviceId: string = '';
    
    private isInitialized: boolean = false;
    private isMobile: boolean = false;
    
    private deviceChangeListeners: Set<() => void> = new Set();
  
    private constructor() {
      this.isMobile = isMobileDevice();
      this.setupDeviceChangeListener();
    }
  
    /**
     * 싱글톤 인스턴스 가져오기
     */
    public static getInstance(): DeviceManager {
      if (!DeviceManager.instance) {
        DeviceManager.instance = new DeviceManager();
      }
      return DeviceManager.instance;
    }
  
    /**
     * 초기화 (권한 요청 + 디바이스 로드)
     * 
     * @returns 초기화 성공 여부
     */
    public async initialize(): Promise<boolean> {
      if (this.isInitialized) {
        console.log('[DeviceManager] Already initialized');
        return true;
      }
  
      try {
        console.log('[DeviceManager] Starting initialization...');
  
        // 1. 권한 체크
        const permissions = await checkDevicePermissions();
        console.log('[DeviceManager] Permissions:', permissions);
  
        // 2. 초기 권한 요청 (최소한의 스트림)
        let initialStream: MediaStream | null = null;
        try {
          initialStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
          });
          console.log('[DeviceManager] Initial permission granted');
        } catch (permError) {
          console.warn('[DeviceManager] Permission denied, will use available devices:', permError);
        }
  
        // 3. 디바이스 목록 로드
        await this.loadDevices();
  
        // 4. 초기 스트림 정리
        if (initialStream) {
          cleanupStream(initialStream);
        }
  
        // 5. 선호 디바이스 설정
        this.loadPreferredDevices();
  
        // 6. 실제 사용할 스트림 생성
        await this.createInitialStream();
  
        this.isInitialized = true;
        console.log('[DeviceManager] Initialization complete');
        
        return true;
      } catch (error) {
        console.error('[DeviceManager] Initialization failed:', error);
        
        // Fallback: 더미 스트림 생성
        this.currentStream = createDummyStream(true, true);
        this.isInitialized = true;
        
        toast.error('디바이스 초기화 실패. 더미 스트림으로 진행합니다.');
        return false;
      }
    }
  
    /**
     * 디바이스 목록 로드
     */
    private async loadDevices(): Promise<void> {
      const devices = await getDeviceList();
      
      this.audioInputs = devices.audioInputs;
      this.videoInputs = devices.videoInputs;
      this.audioOutputs = devices.audioOutputs;
  
      console.log('[DeviceManager] Devices loaded:', {
        audio: this.audioInputs.length,
        video: this.videoInputs.length,
        speakers: this.audioOutputs.length
      });
  
      // 디바이스 변경 이벤트 발생
      this.notifyDeviceChange();
    }
  
    /**
     * 선호 디바이스 로드
     */
    private loadPreferredDevices(): void {
      // localStorage에서 선호 디바이스 가져오기
      const preferredAudio = getPreferredDeviceId('preferredAudioDevice');
      const preferredVideo = getPreferredDeviceId('preferredVideoDevice');
  
      // 유효성 검증 후 설정
      this.selectedAudioDeviceId = isValidDeviceId(preferredAudio, this.audioInputs)
        ? preferredAudio
        : getFirstDeviceId(this.audioInputs);
  
      this.selectedVideoDeviceId = isValidDeviceId(preferredVideo, this.videoInputs)
        ? preferredVideo
        : getFirstDeviceId(this.videoInputs);
  
      console.log('[DeviceManager] Preferred devices:', {
        audio: this.selectedAudioDeviceId.substring(0, 8),
        video: this.selectedVideoDeviceId.substring(0, 8)
      });
    }
  
    /**
     * 초기 스트림 생성
     */
    private async createInitialStream(): Promise<void> {
      try {
        const hasAudio = this.audioInputs.length > 0;
        const hasVideo = this.videoInputs.length > 0;
  
        if (!hasAudio && !hasVideo) {
          // 디바이스 없음 → 더미 스트림
          this.currentStream = createDummyStream(true, true);
          console.log('[DeviceManager] No devices, using dummy stream');
          return;
        }
  
        // 실제 디바이스로 스트림 생성
        this.currentStream = await createMediaStream({
          audioDeviceId: this.selectedAudioDeviceId,
          videoDeviceId: this.selectedVideoDeviceId,
          audioEnabled: hasAudio,
          videoEnabled: hasVideo
        });
  
        console.log('[DeviceManager] Initial stream created');
      } catch (error) {
        console.error('[DeviceManager] Failed to create initial stream:', error);
        this.currentStream = createDummyStream(true, true);
      }
    }
  
    /**
     * 현재 스트림 가져오기
     */
    public getCurrentStream(): MediaStream | null {
      return this.currentStream;
    }
  
    /**
     * 디바이스 목록 가져오기
     */
    public getDevices(): {
      audioInputs: DeviceInfo[];
      videoInputs: DeviceInfo[];
      audioOutputs: DeviceInfo[];
    } {
      return {
        audioInputs: [...this.audioInputs],
        videoInputs: [...this.videoInputs],
        audioOutputs: [...this.audioOutputs]
      };
    }
  
    /**
     * 선택된 디바이스 ID 가져오기
     */
    public getSelectedDevices(): {
      audioDeviceId: string;
      videoDeviceId: string;
    } {
      return {
        audioDeviceId: this.selectedAudioDeviceId,
        videoDeviceId: this.selectedVideoDeviceId
      };
    }
  
    /**
     * 오디오 디바이스 변경
     * 
     * @param deviceId - 새 디바이스 ID
     * @returns 새 스트림
     */
    public async changeAudioDevice(deviceId: string): Promise<MediaStream> {
      console.log('[DeviceManager] Changing audio device to:', deviceId.substring(0, 8));
  
      if (!isValidDeviceId(deviceId, this.audioInputs)) {
        throw new Error('Invalid audio device ID');
      }
  
      // 새 스트림 생성
      const newStream = await createMediaStream({
        audioDeviceId: deviceId,
        videoDeviceId: this.selectedVideoDeviceId,
        audioEnabled: true,
        videoEnabled: this.currentStream?.getVideoTracks().length! > 0
      });
  
      // 이전 스트림 정리
      cleanupStream(this.currentStream);
  
      // 상태 업데이트
      this.currentStream = newStream;
      this.selectedAudioDeviceId = deviceId;
      setPreferredDeviceId('preferredAudioDevice', deviceId);
  
      console.log('[DeviceManager] Audio device changed successfully');
      return newStream;
    }
  
    /**
     * 비디오 디바이스 변경
     * 
     * @param deviceId - 새 디바이스 ID
     * @returns 새 스트림
     */
    public async changeVideoDevice(deviceId: string): Promise<MediaStream> {
      console.log('[DeviceManager] Changing video device to:', deviceId.substring(0, 8));
  
      if (!isValidDeviceId(deviceId, this.videoInputs)) {
        throw new Error('Invalid video device ID');
      }
  
      // 새 스트림 생성
      const newStream = await createMediaStream({
        audioDeviceId: this.selectedAudioDeviceId,
        videoDeviceId: deviceId,
        audioEnabled: this.currentStream?.getAudioTracks().length! > 0,
        videoEnabled: true
      });
  
      // 이전 스트림 정리
      cleanupStream(this.currentStream);
  
      // 상태 업데이트
      this.currentStream = newStream;
      this.selectedVideoDeviceId = deviceId;
      setPreferredDeviceId('preferredVideoDevice', deviceId);
  
      console.log('[DeviceManager] Video device changed successfully');
      return newStream;
    }
  
    /**
     * 카메라 전환 (모바일 전용)
     * 
     * @returns 새 스트림
     */
    public async switchCamera(): Promise<MediaStream> {
      if (!this.isMobile) {
        throw new Error('Camera switching is only available on mobile devices');
      }
  
      console.log('[DeviceManager] Switching camera...');
  
      const currentVideoTrack = this.currentStream?.getVideoTracks()[0];
      if (!currentVideoTrack) {
        throw new Error('No video track to switch');
      }
  
      // 현재 카메라와 다른 카메라 찾기
      const currentDeviceId = currentVideoTrack.getSettings().deviceId;
      const otherCamera = this.videoInputs.find(d => d.deviceId !== currentDeviceId);
  
      if (!otherCamera) {
        throw new Error('No alternative camera found');
      }
  
      // 새 스트림 생성
      const newStream = await createMediaStream({
        audioDeviceId: this.selectedAudioDeviceId,
        videoDeviceId: otherCamera.deviceId,
        audioEnabled: this.currentStream?.getAudioTracks().length! > 0,
        videoEnabled: true
      });
  
      // 이전 스트림 정리
      cleanupStream(this.currentStream);
  
      // 상태 업데이트
      this.currentStream = newStream;
      this.selectedVideoDeviceId = otherCamera.deviceId;
  
      console.log('[DeviceManager] Camera switched successfully');
      return newStream;
    }
  
    /**
     * 디바이스 변경 리스너 등록
     */
    public onDeviceChange(callback: () => void): () => void {
      this.deviceChangeListeners.add(callback);
      return () => this.deviceChangeListeners.delete(callback);
    }
  
    /**
     * 디바이스 변경 알림
     */
    private notifyDeviceChange(): void {
      this.deviceChangeListeners.forEach(callback => callback());
    }
  
    /**
     * 디바이스 변경 감지 설정
     */
    private setupDeviceChangeListener(): void {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log('[DeviceManager] Device change detected');
        await this.loadDevices();
      });
    }
  
    /**
     * 정리
     */
    public cleanup(): void {
      cleanupStream(this.currentStream);
      this.currentStream = null;
      this.isInitialized = false;
      this.deviceChangeListeners.clear();
      console.log('[DeviceManager] Cleaned up');
    }
  }
  
  // 싱글톤 인스턴스 export
  export const deviceManager = DeviceManager.getInstance();
  