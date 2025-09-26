import { toast } from 'sonner';

export interface MediaCapabilities {
  hasCamera: boolean;
  hasMicrophone: boolean;
  hasSpeaker: boolean;
  canReceiveVideo: boolean;
  canReceiveAudio: boolean;
  canShareScreen: boolean;
  canShareFiles: boolean;
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

export interface StreamCreationResult {
  stream: MediaStream;
  capabilities: MediaCapabilities;
  isDummy: boolean;
  warnings: string[];
}

export class MediaCapabilityDetector {
  private static instance: MediaCapabilityDetector;
  private cachedCapabilities: MediaCapabilities | null = null;
  private dummyAudioContext: AudioContext | null = null;
  private dummyOscillator: OscillatorNode | null = null;

  private constructor() {}

  public static getInstance(): MediaCapabilityDetector {
    if (!MediaCapabilityDetector.instance) {
      MediaCapabilityDetector.instance = new MediaCapabilityDetector();
    }
    return MediaCapabilityDetector.instance;
  }

  public async detectCapabilities(forceRefresh: boolean = false): Promise<MediaCapabilities> {
    if (this.cachedCapabilities && !forceRefresh) {
      return this.cachedCapabilities;
    }

    const capabilities: MediaCapabilities = {
      hasCamera: false,
      hasMicrophone: false,
      hasSpeaker: false,
      canReceiveVideo: true,
      canReceiveAudio: true,
      canShareScreen: false,
      canShareFiles: true,
      cameras: [],
      microphones: [],
      speakers: []
    };

    try {
      // 권한 요청 없이 디바이스 확인
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      capabilities.cameras = devices.filter(d => d.kind === 'videoinput');
      capabilities.microphones = devices.filter(d => d.kind === 'audioinput');
      capabilities.speakers = devices.filter(d => d.kind === 'audiooutput');
      
      capabilities.hasCamera = capabilities.cameras.length > 0;
      capabilities.hasMicrophone = capabilities.microphones.length > 0;
      capabilities.hasSpeaker = capabilities.speakers.length > 0;
      
      // 화면 공유 지원 확인
      capabilities.canShareScreen = !!(navigator.mediaDevices as any).getDisplayMedia;
      
      console.log('[MediaCapability] Detected capabilities:', capabilities);
    } catch (error) {
      console.warn('[MediaCapability] Device enumeration failed:', error);
    }

    this.cachedCapabilities = capabilities;
    return capabilities;
  }

  public async getConstrainedStream(
    preferred: MediaStreamConstraints,
    showWarnings: boolean = true
  ): Promise<StreamCreationResult> {
    const capabilities = await this.detectCapabilities();
    const warnings: string[] = [];
    
    // 요청된 미디어와 실제 능력 비교
    const requestsVideo = preferred.video !== false;
    const requestsAudio = preferred.audio !== false;
    
    // 폴백 전략 순서
    const strategies: Array<{ constraints: MediaStreamConstraints | null; description: string }> = [
      {
        constraints: preferred,
        description: 'Requested configuration'
      }
    ];

    // 비디오만 없는 경우
    if (requestsVideo && !capabilities.hasCamera) {
      warnings.push('Camera not available');
      strategies.push({
        constraints: { audio: preferred.audio, video: false },
        description: 'Audio only (no camera)'
      });
    }

    // 오디오만 없는 경우
    if (requestsAudio && !capabilities.hasMicrophone) {
      warnings.push('Microphone not available');
      strategies.push({
        constraints: { audio: false, video: preferred.video },
        description: 'Video only (no microphone)'
      });
    }

    // 둘 다 없는 경우
    if (!capabilities.hasCamera && !capabilities.hasMicrophone) {
      strategies.push({
        constraints: null,
        description: 'Dummy stream (no devices)'
      });
    }

    // 전략 실행
    for (const strategy of strategies) {
      if (strategy.constraints === null) {
        console.log('[MediaCapability] Creating dummy stream');
        const dummyStream = await this.createDummyStream(requestsVideo, requestsAudio);
        
        if (showWarnings && warnings.length > 0) {
          toast.warning(warnings.join(', '));
        }
        
        return {
          stream: dummyStream,
          capabilities,
          isDummy: true,
          warnings
        };
      }

      try {
        console.log(`[MediaCapability] Trying: ${strategy.description}`);
        const stream = await navigator.mediaDevices.getUserMedia(strategy.constraints);
        
        if (showWarnings && warnings.length > 0) {
          toast.warning(warnings.join(', '));
        }
        
        return {
          stream,
          capabilities,
          isDummy: false,
          warnings
        };
      } catch (error) {
        console.warn(`[MediaCapability] Strategy failed: ${strategy.description}`, error);
        continue;
      }
    }

    // 모든 전략 실패 시 더미 스트림
    console.log('[MediaCapability] All strategies failed, creating dummy stream');
    const dummyStream = await this.createDummyStream(requestsVideo, requestsAudio);
    
    return {
      stream: dummyStream,
      capabilities,
      isDummy: true,
      warnings: ['Unable to access any media devices']
    };
  }

  private async createDummyStream(includeVideo: boolean, includeAudio: boolean): Promise<MediaStream> {
    const tracks: MediaStreamTrack[] = [];

    if (includeVideo) {
      const videoTrack = this.createDummyVideoTrack();
      tracks.push(videoTrack);
    }

    if (includeAudio) {
      const audioTrack = this.createDummyAudioTrack();
      tracks.push(audioTrack);
    }

    return new MediaStream(tracks);
  }

  private createDummyVideoTrack(): MediaStreamTrack {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    
    // 애니메이션 프레임 ID
    let animationId: number;
    let hue = 0;
    
    const animate = () => {
      // 그라데이션 배경
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, `hsl(${hue}, 20%, 10%)`);
      gradient.addColorStop(1, `hsl(${hue + 60}, 20%, 15%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 중앙 아이콘과 텍스트
      ctx.fillStyle = '#666';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // 카메라 아이콘 (간단한 도형으로)
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 3;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 - 20;
      
      // 카메라 본체
      ctx.strokeRect(centerX - 30, centerY - 20, 60, 40);
      // 렌즈
      ctx.beginPath();
      ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      // 텍스트
      ctx.fillText('No Camera', canvas.width / 2, canvas.height / 2 + 40);
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = '#555';
      ctx.fillText('Video receiving only', canvas.width / 2, canvas.height / 2 + 65);
      
      hue = (hue + 0.5) % 360;
      animationId = requestAnimationFrame(animate);
    };
    
    animate();
    
    const stream = (canvas as any).captureStream(30); // 30 FPS
    const track = stream.getVideoTracks()[0];
    
    // 트랙이 종료될 때 애니메이션 정리
    const originalStop = track.stop.bind(track);
    track.stop = () => {
      cancelAnimationFrame(animationId);
      originalStop();
    };
    
    return track;
  }

  private createDummyAudioTrack(): MediaStreamTrack {
    if (!this.dummyAudioContext) {
      this.dummyAudioContext = new AudioContext();
      this.dummyOscillator = this.dummyAudioContext.createOscillator();
      const gainNode = this.dummyAudioContext.createGain();
      
      // 완전 무음
      gainNode.gain.value = 0;
      this.dummyOscillator.connect(gainNode);
      
      const destination = this.dummyAudioContext.createMediaStreamDestination();
      gainNode.connect(destination);
      this.dummyOscillator.start();
      
      return destination.stream.getAudioTracks()[0];
    }
    
    const destination = this.dummyAudioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  public cleanup(): void {
    if (this.dummyOscillator) {
      this.dummyOscillator.stop();
      this.dummyOscillator = null;
    }
    if (this.dummyAudioContext) {
      this.dummyAudioContext.close();
      this.dummyAudioContext = null;
    }
    this.cachedCapabilities = null;
  }
}

// 싱글톤 인스턴스 export
export const mediaCapabilityDetector = MediaCapabilityDetector.getInstance();