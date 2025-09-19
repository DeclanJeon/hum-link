import { useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useWebRTCStore } from "@/stores/useWebRTCStore";
import { useUIManagementStore } from "@/stores/useUIManagementStore";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { useAutoHideControls } from "@/hooks/useAutoHideControls";
import { ControlBar } from "@/components/ControlBar";
import { ChatPanel } from "@/components/ChatPanel";
import { WhiteboardPanel } from "@/components/WhiteboardPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { VideoLayout } from "@/components/VideoLayout";
import { toast } from "sonner";

const Room = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  
  // WebRTC 핵심 상태 구독
  const { localStream, peers, isAudioEnabled, isVideoEnabled, isSharingScreen, nickname, init, cleanup, toggleAudio, toggleVideo } = useWebRTCStore();
  
  // UI 상태 구독
  const { activePanel, showControls, viewMode, unreadMessageCount, setActivePanel, setViewMode } = useUIManagementStore();
  
  // 로비에서 가져올 스트림
  const lobbyStream = useLobbyStore((s) => s.stream);
  const { connectionDetails, mediaPreferences } = location.state || {};
  
  // 컨트롤 바 자동 숨김 훅 사용
  useAutoHideControls(3000);

  useEffect(() => {
    if (!roomTitle || !connectionDetails || !mediaPreferences || !lobbyStream) {
      toast.error("Invalid room access. Please prepare in the lobby first.");
      navigate(`/lobby/${roomTitle || ''}`);
      return;
    }

    init(decodeURIComponent(roomTitle), connectionDetails.userId, connectionDetails.nickname, lobbyStream);

    return () => {
      cleanup();
    };
  }, [roomTitle, connectionDetails, mediaPreferences, lobbyStream, init, cleanup, navigate]);
  
  if (!connectionDetails) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <div className="h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="flex-1 relative">
        <VideoLayout
          viewMode={viewMode}
          localStream={localStream}
          localNickname={nickname || "You"}
          localVideoEnabled={isVideoEnabled}
          peers={Array.from(peers.values())}
        />
      </div>

      <ChatPanel isOpen={activePanel === "chat"} onClose={() => setActivePanel("chat")} />
      <WhiteboardPanel isOpen={activePanel === "whiteboard"} onClose={() => setActivePanel("whiteboard")} />
      <SettingsPanel isOpen={activePanel === "settings"} onClose={() => setActivePanel("settings")} />

      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <ControlBar
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isSharingScreen={isSharingScreen}
          activePanel={activePanel}
          viewMode={viewMode}
          unreadMessageCount={unreadMessageCount}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleChat={() => setActivePanel("chat")}
          onToggleWhiteboard={() => setActivePanel("whiteboard")}
          onScreenShare={() => { /* toggleScreenShare(toast) - 구현 필요 */ }}
          onOpenSettings={() => setActivePanel("settings")}
          onSetViewMode={setViewMode}
          onLeave={() => { cleanup(); navigate('/'); }}
        />
      </div>
    </div>
  );
};

export default Room;
