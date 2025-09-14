import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { ControlBar } from "@/components/ControlBar";
import { ChatPanel } from "@/components/ChatPanel";
import { WhiteboardPanel } from "@/components/WhiteboardPanel";
import { VideoPreview } from "@/components/VideoPreview";
import { toast } from "sonner";

// Formula 3: Creative Connection Matrix - Familiar + New in harmony
const Room = () => {
  const navigate = useNavigate();
  const [connectionDetails, setConnectionDetails] = useState<any>(null);
  const [mediaPreferences, setMediaPreferences] = useState<any>(null);
  const [showControls, setShowControls] = useState(true);
  const [activePanel, setActivePanel] = useState<"none" | "chat" | "whiteboard">("none");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Load session data
    const connectionStored = sessionStorage.getItem("connectionDetails");
    const mediaStored = sessionStorage.getItem("mediaPreferences");
    
    if (!connectionStored || !mediaStored) {
      navigate("/");
      return;
    }

    setConnectionDetails(JSON.parse(connectionStored));
    setMediaPreferences(JSON.parse(mediaStored));

    // Simulate connection
    setTimeout(() => {
      setIsConnected(true);
      toast.success("Connected to the conversation!");
    }, 1000);

    // Start audio level simulation (in real app, this would come from WebRTC)
    const audioSimulation = setInterval(() => {
      setAudioLevel(Math.random() * 0.8);
    }, 100);

    return () => {
      clearInterval(audioSimulation);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [navigate]);

  // Formula 4: Problem Redefinition - Controls appear when needed
  const handleMouseMove = () => {
    setShowControls(true);
    
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleLeaveRoom = () => {
    toast("Leaving conversation...");
    navigate("/");
  };

  if (!connectionDetails || !mediaPreferences) {
    return null;
  }

  return (
    <div 
      className="h-screen bg-background flex flex-col relative overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Privacy Indicator - Formula 10: Ethical Design */}
      <div className="absolute top-4 left-4 z-50">
        <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border/30">
          <div className="status-indicator connected" />
          <span className="text-sm font-medium">Live</span>
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 relative">
        <div className="absolute inset-4">
          {/* Remote Participant (Simulated) */}
          <div className="relative w-full h-full">
            <VideoPreview
              nickname="Remote Participant"
              isVideoEnabled={true}
              audioLevel={audioLevel}
              showVoiceFrame={true}
            />
            
            {/* Voice visualization around video frame */}
            <div className="absolute inset-0 pointer-events-none">
              <VoiceVisualizer
                audioLevel={audioLevel}
                isActive={true}
                position="frame"
              />
            </div>
          </div>
        </div>

        {/* Self Video - Picture in Picture */}
        <div className="absolute bottom-20 right-6 w-48 aspect-video">
          <VideoPreview
            nickname={connectionDetails.nickname}
            isVideoEnabled={mediaPreferences.videoEnabled}
            audioLevel={0.3}
          />
        </div>
      </div>

      {/* Side Panels - Formula 8: Complexity Solution */}
      {activePanel === "chat" && (
        <ChatPanel onClose={() => setActivePanel("none")} />
      )}
      
      {activePanel === "whiteboard" && (
        <WhiteboardPanel onClose={() => setActivePanel("none")} />
      )}

      {/* Control Bar - Formula 4: Dynamic visibility */}
      <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 transition-all duration-300 ${
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}>
        <ControlBar
          isAudioEnabled={mediaPreferences.audioEnabled}
          isVideoEnabled={mediaPreferences.videoEnabled}
          activePanel={activePanel}
          onToggleAudio={() => {
            setMediaPreferences(prev => ({...prev, audioEnabled: !prev.audioEnabled}));
            toast(mediaPreferences.audioEnabled ? "Microphone muted" : "Microphone enabled");
          }}
          onToggleVideo={() => {
            setMediaPreferences(prev => ({...prev, videoEnabled: !prev.videoEnabled}));
            toast(mediaPreferences.videoEnabled ? "Camera disabled" : "Camera enabled");
          }}
          onToggleChat={() => setActivePanel(activePanel === "chat" ? "none" : "chat")}
          onToggleWhiteboard={() => setActivePanel(activePanel === "whiteboard" ? "none" : "whiteboard")}
          onLeave={handleLeaveRoom}
        />
      </div>

      {/* Connection Status */}
      {!isConnected && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 animate-pulse mx-auto flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-primary animate-bounce" />
            </div>
            <p className="text-lg font-medium">Connecting to {connectionDetails.roomTitle}...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;