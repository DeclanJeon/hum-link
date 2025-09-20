import { useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useWebRTCStore } from "@/stores/useWebRTCStore";
import { useUIManagementStore } from "@/stores/useUIManagementStore";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { useAutoHideControls } from "@/hooks/useAutoHideControls";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"; // [추가]
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
  
  // WebRTC 스토어에서 화면 공유 관련 함수를 포함한 모든 필요한 상태와 액션을 가져옵니다.
 const {
   localStream, peers, isAudioEnabled, isVideoEnabled, isSharingScreen, nickname,
   // ... 기존 상태들
   isTranscriptionEnabled, transcriptionLanguage, // [추가]
   localTranscript, // [추가] 로컬 자막 데이터
   translationTargetLanguage, // [추가] 번역 언어 설정
   init, cleanup, toggleAudio, toggleVideo, toggleScreenShare,
   toggleTranscription, setLocalTranscript, sendTranscription // [추가]
 } = useWebRTCStore();
  
  // UI 상태 관리
  const { activePanel, showControls, viewMode, unreadMessageCount, setActivePanel, setViewMode } = useUIManagementStore();
  
  // 로비에서 전달받은 상태
  const lobbyStream = useLobbyStore((s) => s.stream);
  const { connectionDetails, mediaPreferences } = location.state || {};
  
  // 컨트롤 바 자동 숨김 훅
  useAutoHideControls(3000);

  // [추가] 음성 인식 훅 초기화
  const { start, stop, isSupported } = useSpeechRecognition({
    lang: transcriptionLanguage,
    onResult: (text, isFinal) => {
      setLocalTranscript({ text, isFinal });
      sendTranscription(text, isFinal);
    },
    onError: (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error("Subtitle feature requires microphone permission.");
        toggleTranscription(); // 기능 자동 비활성화
      }
    }
  });

  // [추가] 자막 기능 활성화/비활성화 제어
  useEffect(() => {
    if (isTranscriptionEnabled && isSupported) {
      start();
    } else {
      stop();
    }
  }, [isTranscriptionEnabled, isSupported, start, stop]);
  
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
          // ✨ Props 전달 ✨
          localTranscript={localTranscript}
          translationTargetLanguage={translationTargetLanguage}
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
          // [추가] 자막 관련 props
          isTranscriptionEnabled={isTranscriptionEnabled} // [추가]
          onToggleTranscription={toggleTranscription} // [추가]
          // ...
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleChat={() => setActivePanel("chat")}
          onToggleWhiteboard={() => setActivePanel("whiteboard")}
          // 화면 공유 버튼에 실제 기능을 연결합니다.
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
