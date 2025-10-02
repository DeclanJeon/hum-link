/**
 * @fileoverview Room 페이지 (수정)
 * @module pages/Room
 */

import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';
import { useAutoHideControls } from '@/hooks/useAutoHideControls';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useRoomOrchestrator } from '@/hooks/useRoomOrchestrator';
import { ControlBar } from '@/components/ControlBar';
import { ChatPanel } from '@/components/ChatPanel';
import { WhiteboardPanel } from '@/components/WhiteboardPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { FileStreamingPanel } from '@/components/FileStreaming/FileStreamingPanel';
import { VideoLayout } from '@/components/VideoLayout';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const Room = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  const isMobile = useIsMobile();

  const { activePanel, showControls, setActivePanel } = useUIManagementStore();
  const { clearSession } = useSessionStore();
  const { localStream } = useMediaDeviceStore();
  
  const { 
    isTranscriptionEnabled, 
    transcriptionLanguage, 
    setLocalTranscript, 
    sendTranscription, 
    toggleTranscription 
  } = useTranscriptionStore();

  const { connectionDetails } = location.state || {};

  // Room 파라미터 생성
  const roomParams = useMemo(() => {
    if (roomTitle && connectionDetails && localStream) {
      return {
        roomId: decodeURIComponent(roomTitle),
        userId: connectionDetails.userId,
        nickname: connectionDetails.nickname,
        localStream: localStream,
      };
    }
    return null;
  }, [roomTitle, connectionDetails, localStream]);

  
  // Room Orchestrator
  useRoomOrchestrator(roomParams);
  
  // 자동 숨김 컨트롤
  useAutoHideControls(isMobile ? 0 : 3000);

  // 음성 인식
  const { start, stop, isSupported } = useSpeechRecognition({
    lang: transcriptionLanguage,
    onResult: (text, isFinal) => {
      setLocalTranscript({ text, isFinal });
      sendTranscription(text, isFinal);
    },
    onError: (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error("자막 기능은 마이크 권한이 필요합니다.");
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

  // 유효성 검증
  useEffect(() => {
    if (!roomParams) {
      toast.error("잘못된 방 접근입니다. 로비에서 다시 시도하세요.");
      navigate(`/lobby/${roomTitle || ''}`);
    }
  }, [roomParams, navigate, roomTitle]);

  // 정리
  useEffect(() => {
    return () => {
      clearSession();
    };
  }, [clearSession]);

  if (!connectionDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-screen bg-background flex flex-col relative overflow-hidden",
      isMobile && "h-[100dvh]"
    )}>
      {/* 비디오 레이아웃 */}
      <div className={cn(
        "flex-1 relative",
        isMobile && "pb-16"
      )}>
        <VideoLayout />
      </div>

      {/* 패널 (모바일 전체화면) */}
      {isMobile ? (
        <>
          {activePanel === "chat" && (
            <div className="fixed inset-0 z-50 bg-background">
              <ChatPanel 
                isOpen={true} 
                onClose={() => setActivePanel("none")} 
              />
            </div>
          )}

          {activePanel === "whiteboard" && (
            <div className="fixed inset-0 z-50 bg-background">
              <WhiteboardPanel 
                isOpen={true} 
                onClose={() => setActivePanel("none")} 
              />
            </div>
          )}

          {activePanel === "settings" && (
            <div className="fixed inset-0 z-50">
              <SettingsPanel 
                isOpen={true} 
                onClose={() => setActivePanel("none")} 
              />
            </div>
          )}

          {activePanel === "fileStreaming" && (
            <FileStreamingPanel
              isOpen={true}
              onClose={() => setActivePanel("none")}
            />
          )}
        </>
      ) : (
        <>
          <ChatPanel 
            isOpen={activePanel === "chat"} 
            onClose={() => setActivePanel("chat")} 
          />
          <WhiteboardPanel 
            isOpen={activePanel === "whiteboard"} 
            onClose={() => setActivePanel("whiteboard")} 
          />
          <SettingsPanel 
            isOpen={activePanel === "settings"} 
            onClose={() => setActivePanel("settings")} 
          />
          <FileStreamingPanel
            isOpen={activePanel === "fileStreaming"}
            onClose={() => setActivePanel("none")}
          />
        </>
      )}

      {/* 컨트롤 바 */}
      {!isMobile ? (
        <div className={cn(
          "absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <ControlBar />
        </div>
      ) : (
        <ControlBar />
      )}
    </div>
  );
};

export default Room;
