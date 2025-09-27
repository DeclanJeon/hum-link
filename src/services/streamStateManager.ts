import { toast } from 'sonner';

export interface StreamSnapshot {
  hasVideo: boolean;
  hasAudio: boolean;
  videoMuted: boolean;
  audioMuted: boolean;
  videoEnabled: boolean;
  audioEnabled: boolean;
  streamType: 'camera' | 'screen' | 'none';
  deviceIds: {
    videoId?: string;
    audioId?: string;
  };
  constraints?: MediaStreamConstraints;
  tracks: Array<{
    kind: 'audio' | 'video';
    enabled: boolean;
    muted: boolean;
    label: string;
    settings: MediaTrackSettings;
  }>;
}

export class StreamStateManager {
  private snapshot: StreamSnapshot | null = null;
  private originalStream: MediaStream | null = null;
  
  captureState(stream: MediaStream | null): void {
    console.log('[StreamStateManager] Capturing stream state');
    
    if (!stream) {
      this.snapshot = {
        hasVideo: false,
        hasAudio: false,
        videoMuted: false,
        audioMuted: false,
        videoEnabled: false,
        audioEnabled: false,
        streamType: 'none',
        deviceIds: {},
        tracks: []
      };
      this.originalStream = null;
      return;
    }
    
    this.originalStream = stream;
    
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    let streamType: 'camera' | 'screen' | 'none' = 'none';
    if (videoTracks.length > 0) {
      const videoTrack = videoTracks[0];
      if (videoTrack.label.toLowerCase().includes('screen') || 
          videoTrack.label.toLowerCase().includes('window') ||
          videoTrack.label.toLowerCase().includes('tab')) {
        streamType = 'screen';
      } else {
        streamType = 'camera';
      }
    }
    
    this.snapshot = {
      hasVideo: videoTracks.length > 0,
      hasAudio: audioTracks.length > 0,
      videoMuted: videoTracks.length > 0 ? videoTracks[0].muted : false,
      audioMuted: audioTracks.length > 0 ? audioTracks[0].muted : false,
      videoEnabled: videoTracks.length > 0 ? videoTracks[0].enabled : false,
      audioEnabled: audioTracks.length > 0 ? audioTracks[0].enabled : false,
      streamType,
      deviceIds: {
        videoId: videoTracks[0]?.getSettings()?.deviceId,
        audioId: audioTracks[0]?.getSettings()?.deviceId
      },
      tracks: stream.getTracks().map(track => ({
        kind: track.kind as 'audio' | 'video',
        enabled: track.enabled,
        muted: track.muted,
        label: track.label,
        settings: track.getSettings()
      }))
    };
    
    console.log('[StreamStateManager] State captured:', this.snapshot);
  }
  
  async restoreState(): Promise<MediaStream | null> {
    console.log('[StreamStateManager] Restoring stream state');
    
    if (!this.snapshot) {
      console.log('[StreamStateManager] No snapshot to restore');
      return null;
    }
    
    if (this.snapshot.streamType === 'none') {
      console.log('[StreamStateManager] Original state was no stream');
      return null;
    }
    
    if (this.originalStream && this.originalStream.active) {
      console.log('[StreamStateManager] Returning original active stream');
      
      this.originalStream.getTracks().forEach((track, index) => {
        const originalState = this.snapshot!.tracks[index];
        if (originalState) {
          track.enabled = originalState.enabled;
        }
      });
      
      return this.originalStream;
    }
    
    if (this.snapshot.streamType === 'screen') {
      console.log('[StreamStateManager] Cannot restore screen share automatically');
      toast.info('Screen sharing was stopped. Please share your screen again if needed.');
      return null;
    }
    
    try {
      const constraints: MediaStreamConstraints = {
        video: this.snapshot.hasVideo ? {
          deviceId: this.snapshot.deviceIds.videoId ? 
            { exact: this.snapshot.deviceIds.videoId } : undefined
        } : false,
        audio: this.snapshot.hasAudio ? {
          deviceId: this.snapshot.deviceIds.audioId ? 
            { exact: this.snapshot.deviceIds.audioId } : undefined
        } : false
      };
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      newStream.getVideoTracks().forEach(track => {
        track.enabled = this.snapshot!.videoEnabled;
      });
      
      newStream.getAudioTracks().forEach(track => {
        track.enabled = this.snapshot!.audioEnabled;
      });
      
      console.log('[StreamStateManager] Stream restored successfully');
      return newStream;
      
    } catch (error) {
      console.error('[StreamStateManager] Failed to restore stream:', error);
      toast.error('Failed to restore camera. Please re-enable it manually.');
      return null;
    }
  }
  
  isDummyStream(): boolean {
    return this.snapshot?.streamType === 'none' || 
           (this.snapshot?.tracks.length === 0) ||
           false;
  }
  
  restoreTrackStates(stream: MediaStream): void {
    if (!this.snapshot || !stream) return;
    
    stream.getVideoTracks().forEach(track => {
      track.enabled = this.snapshot!.videoEnabled;
    });
    
    stream.getAudioTracks().forEach(track => {
      track.enabled = this.snapshot!.audioEnabled;
    });
  }
  
  reset(): void {
    this.snapshot = null;
    this.originalStream = null;
  }
  
  getSnapshot(): StreamSnapshot | null {
    return this.snapshot;
  }
  
  hasSnapshot(): boolean {
    return this.snapshot !== null;
  }
}
