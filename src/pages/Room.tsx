import { useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useWebRTCStore, PeerState } from "@/stores/useWebRTCStore";
import { useLobbyStore } from "@/stores/useLobbyStore"; // 핵심: Lobby 스토어를 import합니다.
import { ControlBar } from "@/components/ControlBar";
import { ChatPanel } from "@/components/ChatPanel";
import { WhiteboardPanel } from "@/components/WhiteboardPanel";
import { VideoPreview } from "@/components/VideoPreview";
import { SettingsPanel } from "@/components/SettingsPanel";
import { toast } from "sonner";

const Room = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  
  const {
    localStream,
    peers,
    isAudioEnabled,
    isVideoEnabled,
    activePanel,
    showControls,
    init,
    cleanup,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setActivePanel,
    setShowControls,
  } = useWebRTCStore();

  const nickname = useWebRTCStore(state => state.nickname);

  // 변경점: location.state 대신 useLobbyStore에서 스트림을 직접 가져옵니다.
  const lobbyStream = useLobbyStore((s) => s.stream);
  const { connectionDetails, mediaPreferences } = location.state || {};
  
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // 변경점: 이제 lobbyStream의 존재 여부를 확인합니다.
    if (!roomTitle || !connectionDetails || !mediaPreferences || !lobbyStream) {
      toast.error("Invalid room access. Please prepare in the lobby first.");
      navigate(`/lobby/${roomTitle || ''}`);
      return;
    }

    // 변경점: 초기화 시 lobbyStream을 전달합니다.
    init(decodeURIComponent(roomTitle), connectionDetails.userId, connectionDetails.nickname, lobbyStream);

    return () => {
      cleanup();
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [roomTitle, connectionDetails, mediaPreferences, lobbyStream, init, cleanup, navigate]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const remotePeers = Array.from(peers.values());

  if (!connectionDetails) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <div className="h-screen bg-background flex flex-col relative overflow-hidden" onMouseMove={handleMouseMove}>
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border/30">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium">Live & Encrypted</span>
      </div>

      <div className="flex-1 relative">
        {remotePeers.length > 0 ? (
          <div className="absolute inset-4">
            <VideoPreview
              stream={remotePeers[0].stream || null}
              nickname={remotePeers[0].nickname}
              isVideoEnabled={remotePeers[0].videoEnabled}
            />
            {(() => {
              const peer = remotePeers[0];
              if (peer.connectionState === 'connecting') {
                return (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                    <p className="text-white text-lg font-medium">Connecting...</p>
                  </div>
                );
              } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
                return (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                    <p className="text-white text-lg font-medium">Connection lost.</p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        ) : (
          <div className="absolute inset-4 flex items-center justify-center bg-muted/50 rounded-lg">
            <p className="text-muted-foreground">Waiting for another participant...</p>
          </div>
        )}
        
        <div className="absolute bottom-24 right-6 w-48 lg:w-64 aspect-video z-20">
          <VideoPreview
            stream={localStream}
            nickname={nickname || "You"}
            isVideoEnabled={isVideoEnabled}
            isLocalVideo={true}
          />
        </div>
      </div>

      <ChatPanel isOpen={activePanel === "chat"} onClose={() => setActivePanel("none")} />
      <WhiteboardPanel isOpen={activePanel === "whiteboard"} onClose={() => setActivePanel("none")} />
      <SettingsPanel isOpen={activePanel === "settings"} onClose={() => setActivePanel("none")} />

      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <ControlBar
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          activePanel={activePanel}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleChat={() => setActivePanel("chat")}
          onToggleWhiteboard={() => setActivePanel("whiteboard")}
          onScreenShare={() => toggleScreenShare(toast)}
          onOpenSettings={() => setActivePanel("settings")}
          onLeave={() => { cleanup(); navigate('/'); }}
        />
      </div>
    </div>
  );
};

export default Room;
