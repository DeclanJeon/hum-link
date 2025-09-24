import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useLobbyStore } from '@/stores/useLobbyStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';
import { useAutoHideControls } from '@/hooks/useAutoHideControls';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useRoomOrchestrator } from '@/hooks/useRoomOrchestrator';
import { ControlBar } from '@/components/ControlBar';
import { ChatPanel } from '@/components/ChatPanel';
import { WhiteboardPanel } from '@/components/WhiteboardPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { VideoLayout } from '@/components/VideoLayout';
import { toast } from 'sonner';

const Room = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomTitle } = useParams<{ roomTitle: string }>();

  // --- UI 상태 및 액션 ---
  const { activePanel, showControls, setActivePanel } = useUIManagementStore();
  
  // --- 자막 관련 상태 및 액션 ---
  const { isTranscriptionEnabled, transcriptionLanguage, setLocalTranscript, sendTranscription, toggleTranscription } = useTranscriptionStore();

  // --- 로비에서 전달받은 데이터 ---
  const lobbyStream = useLobbyStore((s) => s.stream);
  const { connectionDetails } = location.state || {};
  
  // --- 핵심 로직 실행 ---
  const roomParams = useMemo(() => {
    if (roomTitle && connectionDetails && lobbyStream) {
      return {
        roomId: decodeURIComponent(roomTitle),
        userId: connectionDetails.userId,
        nickname: connectionDetails.nickname,
        localStream: lobbyStream,
      };
    }
    return null;
  }, [roomTitle, connectionDetails, lobbyStream]);

  useRoomOrchestrator(roomParams);
  useAutoHideControls(3000);

  const { start, stop, isSupported } = useSpeechRecognition({
    lang: transcriptionLanguage,
    onResult: (text, isFinal) => {
      setLocalTranscript({ text, isFinal });
      sendTranscription(text, isFinal);
    },
    onError: (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error("Subtitle feature requires microphone permission.");
        toggleTranscription();
      }
    }
  });

  useEffect(() => {
    if (isTranscriptionEnabled && isSupported) {
      start();
    } else {
      stop();
    }
    return () => stop();
  }, [isTranscriptionEnabled, isSupported, start, stop]);

  useEffect(() => {
    if (!roomParams) {
      toast.error("Invalid room access. Please prepare in the lobby first.");
      navigate(`/lobby/${roomTitle || ''}`);
    }
  }, [roomParams, navigate, roomTitle]);

  if (!connectionDetails) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <div className="h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="flex-1 relative">
        <VideoLayout />
      </div>

      <ChatPanel isOpen={activePanel === "chat"} onClose={() => setActivePanel("chat")} />
      <WhiteboardPanel isOpen={activePanel === "whiteboard"} onClose={() => setActivePanel("whiteboard")} />
      <SettingsPanel isOpen={activePanel === "settings"} onClose={() => setActivePanel("settings")} />

      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* ControlBar는 이제 props가 필요 없습니다. */}
        <ControlBar />
      </div>
    </div>
  );
};

export default Room;