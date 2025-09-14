import { useEffect, useRef } from "react";
import { VoiceVisualizer } from "./VoiceVisualizer";

interface VideoPreviewProps {
  stream?: MediaStream;
  isVideoEnabled: boolean;
  nickname: string;
  audioLevel?: number;
  showVoiceFrame?: boolean;
}

// Video preview with integrated voice visualization
export const VideoPreview = ({ 
  stream, 
  isVideoEnabled, 
  nickname, 
  audioLevel = 0,
  showVoiceFrame = false 
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative w-full aspect-video bg-card rounded-xl overflow-hidden shadow-[var(--shadow-elegant)] border border-border/30">
      {/* Voice Visualization Frame Overlay */}
      {showVoiceFrame && (
        <VoiceVisualizer 
          audioLevel={audioLevel} 
          isActive={true}
          position="frame"
        />
      )}

      {/* Video Stream */}
      {isVideoEnabled && stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
              <span className="text-3xl font-bold text-primary">
                {nickname.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-lg font-medium text-foreground">{nickname}</p>
              <p className="text-sm text-muted-foreground">
                {isVideoEnabled ? "Starting camera..." : "Camera is off"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Nickname Overlay */}
      <div className="absolute bottom-4 left-4">
        <div className="bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/30">
          <span className="text-sm font-medium text-foreground">{nickname}</span>
        </div>
      </div>

      {/* Connection Status */}
      <div className="absolute top-4 right-4">
        <div className="status-indicator connected" />
      </div>
    </div>
  );
};