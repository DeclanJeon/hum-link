import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRoomStore } from "@/stores/useRoomStore";
import { ControlBar } from "@/components/ControlBar";
import { ChatPanel } from "@/components/ChatPanel";
import { WhiteboardPanel } from "@/components/WhiteboardPanel";
import { VideoPreview } from "@/components/VideoPreview";
import { SettingsPanel } from "@/components/SettingsPanel";
import { toast } from "sonner";

// Formula 3 & 8: A clean component structure is the result of creative connection and complexity solution
const Room = () => {
  const navigate = useNavigate();
  const {
    connectionDetails,
    mediaPreferences,
    localStream,
    remoteStream,
    isConnecting,
    activePanel,
    showControls,
    remoteAudioLevel,
    init,
    toggleAudio,
    toggleVideo,
    setActivePanel,
    setShowControls,
    setRemoteAudioLevel,
    handleLeaveRoom,
    handleScreenShare,
    cleanup,
  } = useRoomStore();

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    init().then(() => {
      if (!sessionStorage.getItem("connectionDetails")) {
        navigate("/");
      }
    });

    // Simulate remote audio level
    const audioSimulation = setInterval(() => {
      setRemoteAudioLevel(Math.random() * 0.8);
    }, 100);

    return () => {
      cleanup();
      clearInterval(audioSimulation);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };


  // FLICKER FIX: Render loading state until connection is established
  if (isConnecting || !connectionDetails || !mediaPreferences) {
    return (
      <div className="absolute inset-0 bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 animate-pulse mx-auto flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-primary animate-bounce" />
          </div>
          <p className="text-lg font-medium">Initializing secure connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-screen bg-background flex flex-col relative overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Privacy Indicator - Formula 10: Ethical Design */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border/30">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium">Live</span>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 relative">
        <div className="absolute inset-4">
          {/* Remote Participant (Simulated with a placeholder) */}
          <VideoPreview
            stream={remoteStream} // Pass remote stream here in a real app
            nickname="Remote Participant"
            isVideoEnabled={true} // This would come from remote user's state
            audioLevel={remoteAudioLevel}
            showVoiceFrame={true}
          />
        </div>

        {/* Self Video - Picture in Picture (NOW WORKING) */}
        <div className="absolute bottom-24 right-6 w-48 lg:w-64 aspect-video z-20">
          <VideoPreview
            stream={localStream}
            nickname={connectionDetails.nickname}
            isVideoEnabled={mediaPreferences.videoEnabled}
            isLocalVideo={true}
          />
        </div>
      </div>

      {/* Side Panels - Formula 8: Complexity Solution */}
      <ChatPanel isOpen={activePanel === "chat"} onClose={() => setActivePanel("none")} />
      <WhiteboardPanel isOpen={activePanel === "whiteboard"} onClose={() => setActivePanel("none")} />
      <SettingsPanel isOpen={activePanel === "settings"} onClose={() => setActivePanel("none")} />

      {/* Control Bar - Formula 4: Dynamic visibility */}
      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30 ${
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
      }`}>
        <ControlBar
          isAudioEnabled={mediaPreferences.audioEnabled}
          isVideoEnabled={mediaPreferences.videoEnabled}
          activePanel={activePanel}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleChat={() => setActivePanel("chat")}
          onToggleWhiteboard={() => setActivePanel("whiteboard")}
          onScreenShare={() => handleScreenShare(toast)}
          onOpenSettings={() => setActivePanel("settings")}
          onLeave={() => handleLeaveRoom(navigate, toast)}
        />
      </div>
    </div>
  );
};

export default Room;