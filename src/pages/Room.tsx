import { useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useWebRTCStore, PeerState, ViewMode } from "@/stores/useWebRTCStore";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { ControlBar } from "@/components/ControlBar";
import { ChatPanel } from "@/components/ChatPanel";
import { WhiteboardPanel } from "@/components/WhiteboardPanel";
import { VideoPreview } from "@/components/VideoPreview";
import { SettingsPanel } from "@/components/SettingsPanel";
import { toast } from "sonner";

// ====================================================================
// 동적 레이아웃 컴포넌트
// ====================================================================
interface VideoLayoutProps {
  viewMode: ViewMode;
  localStream: MediaStream | null;
  localNickname: string;
  localVideoEnabled: boolean;
  peers: PeerState[];
}

const VideoLayout = ({ viewMode, localStream, localNickname, localVideoEnabled, peers }: VideoLayoutProps) => {
  const allParticipants = [
    { 
      isLocal: true, 
      userId: 'local', 
      nickname: localNickname, 
      stream: localStream, 
      videoEnabled: localVideoEnabled 
    },
    ...peers.map(p => ({ ...p, isLocal: false }))
  ];

  if (viewMode === 'grid') {
    const total = allParticipants.length;

    // 변경점: 동적 클래스 생성을 정적 매핑으로 변경
    const getGridClass = (count: number) => {
      if (count <= 2) return 'grid-cols-2';
      if (count <= 4) return 'grid-cols-2'; // 3, 4명일 때도 2x2가 보기 좋습니다.
      if (count <= 6) return 'grid-cols-3';
      if (count <= 9) return 'grid-cols-3';
      return 'grid-cols-4'; // 최대 16명까지
    };

    const gridClass = getGridClass(total);

    return (
      // Tailwind가 인식할 수 있도록 정적 문자열을 사용합니다.
      <div className={`grid ${gridClass} gap-4 w-full h-full p-4`}>
        {allParticipants.map(p => (
          <div key={p.userId} className="w-full h-full">
            <VideoPreview
              stream={p.stream || null}
              nickname={p.nickname}
              isVideoEnabled={p.videoEnabled}
              isLocalVideo={p.isLocal}
            />
          </div>
        ))}
      </div>
    );
  }

  // 기본값은 'speaker' 뷰
  const remotePeer = peers.length > 0 ? peers[0] : null;
  return (
    <>
      {remotePeer ? (
        <div className="absolute inset-4">
          <VideoPreview
            stream={remotePeer.stream || null}
            nickname={remotePeer.nickname}
            isVideoEnabled={remotePeer.videoEnabled}
          />
          {(() => {
            if (remotePeer.connectionState === 'connecting') {
              return (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                  <p className="text-white text-lg font-medium">Connecting...</p>
                </div>
              );
            } else if (remotePeer.connectionState === 'disconnected' || remotePeer.connectionState === 'failed') {
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
          nickname={localNickname}
          isVideoEnabled={localVideoEnabled}
          isLocalVideo={true}
        />
      </div>
    </>
  );
};


// ====================================================================
// Room 컴포넌트 (이 부분은 변경 없음)
// ====================================================================
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
    viewMode,
    init,
    cleanup,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setActivePanel,
    setShowControls,
    setViewMode,
  } = useWebRTCStore();

  const nickname = useWebRTCStore(state => state.nickname);
  const lobbyStream = useLobbyStore((s) => s.stream);
  const { connectionDetails, mediaPreferences } = location.state || {};
  
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!roomTitle || !connectionDetails || !mediaPreferences || !lobbyStream) {
      toast.error("Invalid room access. Please prepare in the lobby first.");
      navigate(`/lobby/${roomTitle || ''}`);
      return;
    }

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
        <VideoLayout
          viewMode={viewMode}
          localStream={localStream}
          localNickname={nickname || "You"}
          localVideoEnabled={isVideoEnabled}
          peers={remotePeers}
        />
      </div>

      <ChatPanel isOpen={activePanel === "chat"} onClose={() => setActivePanel("none")} />
      <WhiteboardPanel isOpen={activePanel === "whiteboard"} onClose={() => setActivePanel("none")} />
      <SettingsPanel isOpen={activePanel === "settings"} onClose={() => setActivePanel("none")} />

      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <ControlBar
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          activePanel={activePanel}
          viewMode={viewMode}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleChat={() => setActivePanel("chat")}
          onToggleWhiteboard={() => setActivePanel("whiteboard")}
          onScreenShare={() => toggleScreenShare(toast)}
          onOpenSettings={() => setActivePanel("settings")}
          onSetViewMode={setViewMode}
          onLeave={() => { cleanup(); navigate('/'); }}
        />
      </div>
    </div>
  );
};

export default Room;