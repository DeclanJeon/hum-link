/**
 * @fileoverview    -    
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
 *    
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
  public isMobile: boolean = false;
  
  private deviceChangeListeners: Set<() => void> = new Set();

  private constructor() {
    this.isMobile = isMobileDevice();
    this.setupDeviceChangeListener();
  }

  /**
   *   
   */
  public static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  /**
   *  (  +  )
   * 
   * @returns   
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('[DeviceManager] Already initialized');
      return true;
    }

    try {
      console.log('[DeviceManager] Starting initialization...');

      const permissions = await checkDevicePermissions();
      console.log('[DeviceManager] Permissions:', permissions);

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

      await this.loadDevices();

      if (initialStream) {
        cleanupStream(initialStream);
      }

      this.loadPreferredDevices();

      await this.createInitialStream();

      this.isInitialized = true;
      console.log('[DeviceManager] Initialization complete');
      
      return true;
    } catch (error) {
      console.error('[DeviceManager] Initialization failed:', error);
      
      this.currentStream = createDummyStream(true, true);
      this.isInitialized = true;
      
      toast.error('미디어 장치를 찾을 수 없습니다. 더미 스트림을 사용합니다.');
      return false;
    }
  }

  /**
   *   
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

    this.notifyDeviceChange();
  }

  /**
   *   
   */
  private loadPreferredDevices(): void {
    const preferredAudio = getPreferredDeviceId('preferredAudioDevice');
    const preferredVideo = getPreferredDeviceId('preferredVideoDevice');

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
   *   
   */
  private async createInitialStream(): Promise<void> {
    try {
      const hasAudio = this.audioInputs.length > 0;
      const hasVideo = this.videoInputs.length > 0;

      if (!hasAudio && !hasVideo) {
        this.currentStream = createDummyStream(true, true);
        console.log('[DeviceManager] No devices, using dummy stream');
        return;
      }

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
   *   
   */
  public getCurrentStream(): MediaStream | null {
    return this.currentStream;
  }

  /**
   *   
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
   *   ID 
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
   *   
   * 
   * @param deviceId -   ID
   * @returns  
   */
  public async changeAudioDevice(deviceId: string): Promise<MediaStream> {
    console.log('[DeviceManager] Changing audio device to:', deviceId.substring(0, 8));

    if (!isValidDeviceId(deviceId, this.audioInputs)) {
      throw new Error('Invalid audio device ID');
    }

    const newStream = await createMediaStream({
      audioDeviceId: deviceId,
      videoDeviceId: this.selectedVideoDeviceId,
      audioEnabled: true,
      videoEnabled: this.currentStream?.getVideoTracks().length! > 0
    });

    cleanupStream(this.currentStream);

    this.currentStream = newStream;
    this.selectedAudioDeviceId = deviceId;
    setPreferredDeviceId('preferredAudioDevice', deviceId);

    console.log('[DeviceManager] Audio device changed successfully');
    return newStream;
  }

  /**
   *   
   * 
   * @param deviceId -   ID
   * @returns  
   */
  public async changeVideoDevice(deviceId: string): Promise<MediaStream> {
    console.log('[DeviceManager] Changing video device to:', deviceId.substring(0, 8));

    if (!isValidDeviceId(deviceId, this.videoInputs)) {
      throw new Error('Invalid video device ID');
    }

    const newStream = await createMediaStream({
      audioDeviceId: this.selectedAudioDeviceId,
      videoDeviceId: deviceId,
      audioEnabled: this.currentStream?.getAudioTracks().length! > 0,
      videoEnabled: true
    });

    cleanupStream(this.currentStream);

    this.currentStream = newStream;
    this.selectedVideoDeviceId = deviceId;
    setPreferredDeviceId('preferredVideoDevice', deviceId);

    console.log('[DeviceManager] Video device changed successfully');
    return newStream;
  }

  /**
   *   ( )
   * 
   * @returns  
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

    const currentDeviceId = currentVideoTrack.getSettings().deviceId;
    const otherCamera = this.videoInputs.find(d => d.deviceId !== currentDeviceId);

    if (!otherCamera) {
      throw new Error('No alternative camera found');
    }

    const newStream = await createMediaStream({
      audioDeviceId: this.selectedAudioDeviceId,
      videoDeviceId: otherCamera.deviceId,
      audioEnabled: this.currentStream?.getAudioTracks().length! > 0,
      videoEnabled: true
    });

    cleanupStream(this.currentStream);

    this.currentStream = newStream;
    this.selectedVideoDeviceId = otherCamera.deviceId;

    console.log('[DeviceManager] Camera switched successfully');
    return newStream;
  }

  /**
   *    
   */
  public onDeviceChange(callback: () => void): () => void {
    this.deviceChangeListeners.add(callback);
    return () => this.deviceChangeListeners.delete(callback);
  }

  /**
   *   
   */
  private notifyDeviceChange(): void {
    this.deviceChangeListeners.forEach(callback => callback());
  }

  /**
   *    
   */
  private setupDeviceChangeListener(): void {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      console.log('[DeviceManager] Device change detected');
      await this.loadDevices();
    });
  }

  /**
   * 
   */
  public cleanup(): void {
    cleanupStream(this.currentStream);
    this.currentStream = null;
    this.isInitialized = false;
    this.deviceChangeListeners.clear();
    console.log('[DeviceManager] Cleaned up');
  }
}

export const deviceManager = DeviceManager.getInstance();
