import { useEffect, useRef } from "react";
import { VoiceVisualizer } from "./VoiceVisualizer"; // Assuming this component exists and is correct

interface VideoPreviewProps {
  stream: MediaStream | null; // EVOLUTION 1: Stream is now nullable, but it's the ONLY source for the video
  isVideoEnabled: boolean;
  nickname: string;
  audioLevel?: number;
  showVoiceFrame?: boolean;
  isLocalVideo?: boolean;
}

// Formula 7: Thinking Evolution - The component has evolved to be a pure, predictable presentation layer.
export const VideoPreview = ({
  stream,
  isVideoEnabled,
  nickname,
  audioLevel = 0,
  showVoiceFrame = false,
  isLocalVideo = false,
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // EVOLUTION 2: SIMPLIFIED & ROBUST STREAM HANDLING
    // The component's ONLY responsibility is to bind the stream from props to the video element.
    // It NO LONGER fetches its own media. This prevents all resource leaks and state conflicts.
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]); // The effect now ONLY depends on the stream object itself.

  return (
    <div className="relative w-full h-full bg-muted rounded-lg overflow-hidden flex items-center justify-center shadow-md border border-border/20">
      {/* 
        EVOLUTION 3: LOGICAL & PREDICTABLE RENDERING
        The video element is rendered, but its visibility is controlled by CSS.
        This prevents jarring layout shifts when the video turns on/off.
        The video is shown ONLY IF the stream exists AND video is enabled.
      */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocalVideo} // EVOLUTION 4: Mute is now conditional, critical for preventing echo.
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          stream && isVideoEnabled ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Placeholder UI: Shown when video is not active */}
      {(!stream || !isVideoEnabled) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary/50 to-muted">
          <div className="w-20 h-20 lg:w-24 lg:h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-3xl lg:text-4xl font-bold text-primary">
              {nickname.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      
      {/* Voice Visualization Frame Overlay */}
      {showVoiceFrame && (
        <VoiceVisualizer
          audioLevel={audioLevel}
          isActive={true}
          position="frame"
        />
      )}

      {/* Nickname Overlay at the bottom */}
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-white">
        {nickname}
      </div>
    </div>
  );
};