import { toast } from 'sonner';

export type CameraFacing = 'user' | 'environment';

export interface CameraInfo {
  deviceId: string;
  label: string;
  facing?: CameraFacing;
}

export class CameraManager {
  private static instance: CameraManager;
  private currentFacing: CameraFacing = 'user';
  private availableCameras: CameraInfo[] = [];
  
  private constructor() {}

  public static getInstance(): CameraManager {
    if (!CameraManager.instance) {
      CameraManager.instance = new CameraManager();
    }
    return CameraManager.instance;
  }

  public isMobileDevice(): boolean {
    // 다양한 방법으로 모바일 감지
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileKeywords = ['android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
    const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
    
    // 터치 지원 확인
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // 화면 크기 확인
    const isSmallScreen = window.innerWidth <= 768;
    
    // 가속도계 등 모바일 센서 확인
    const hasMobileSensors = 'DeviceOrientationEvent' in window;
    
    return isMobileUA || (hasTouch && isSmallScreen) || hasMobileSensors;
  }

  public async detectCameras(): Promise<CameraInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      
      this.availableCameras = cameras.map(camera => {
        const label = camera.label.toLowerCase();
        let facing: CameraFacing | undefined;
        
        if (label.includes('front') || label.includes('user')) {
          facing = 'user';
        } else if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
          facing = 'environment';
        }
        
        return {
          deviceId: camera.deviceId,
          label: camera.label || `Camera ${camera.deviceId.substr(0, 8)}`,
          facing
        };
      });
      
      return this.availableCameras;
    } catch (error) {
      console.error('[CameraManager] Failed to detect cameras:', error);
      return [];
    }
  }

  public async switchCamera(currentStream: MediaStream | null): Promise<MediaStream | null> {
    if (!this.isMobileDevice()) {
      toast.warning('Camera switching is only available on mobile devices');
      return currentStream;
    }

    const newFacing: CameraFacing = this.currentFacing === 'user' ? 'environment' : 'user';
    
    try {
      // 현재 스트림의 오디오 트랙 보존
      const audioTrack = currentStream?.getAudioTracks()[0];
      
      // 새 비디오 스트림 생성
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { exact: newFacing } },
        audio: false // 오디오는 별도로 처리
      };
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // 오디오 트랙이 있으면 새 스트림에 추가
      if (audioTrack) {
        newStream.addTrack(audioTrack.clone());
      }
      
      // 이전 비디오 트랙 정지
      currentStream?.getVideoTracks().forEach(track => track.stop());
      
      this.currentFacing = newFacing;
      
      toast.success(`Switched to ${newFacing === 'user' ? 'front' : 'back'} camera`);
      return newStream;
      
    } catch (error: any) {
      // exact 제약이 실패하면 ideal로 재시도
      try {
        const fallbackConstraints: MediaStreamConstraints = {
          video: { facingMode: newFacing },
          audio: false
        };
        
        const newStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        
        const audioTrack = currentStream?.getAudioTracks()[0];
        if (audioTrack) {
          newStream.addTrack(audioTrack.clone());
        }
        
        currentStream?.getVideoTracks().forEach(track => track.stop());
        
        this.currentFacing = newFacing;
        toast.success(`Switched camera`);
        return newStream;
        
      } catch (fallbackError) {
        console.error('[CameraManager] Failed to switch camera:', fallbackError);
        toast.error('Failed to switch camera');
        return currentStream;
      }
    }
  }

  public getCurrentFacing(): CameraFacing {
    return this.currentFacing;
  }

  public getAvailableCameras(): CameraInfo[] {
    return this.availableCameras;
  }

  public hasMultipleCameras(): boolean {
    return this.availableCameras.length > 1;
  }
}

export const cameraManager = CameraManager.getInstance();