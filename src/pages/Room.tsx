import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useLobbyStore } from '@/stores/useLobbyStore';
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
import { useTurnCredentials } from '@/hooks/useTurnCredentials';
import { useSignalingStore } from '@/stores/useSignalingStore';
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { usePeerConnectionStore } from '@/stores/usePeerConnectionStore';

const Room = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  const isMobile = useIsMobile();

  const { activePanel, showControls, setActivePanel } = useUIManagementStore();
  const { clearSession } = useSessionStore();
  const { 
    isTranscriptionEnabled, 
    transcriptionLanguage, 
    setLocalTranscript, 
    sendTranscription, 
    toggleTranscription 
  } = useTranscriptionStore();

  const lobbyStream = useLobbyStore((s) => s.stream);
  const { connectionDetails } = location.state || {};
  
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

  useTurnCredentials();

  useRoomOrchestrator(roomParams);
  
  // 모바일에서는 자동 숨김 비활성화
  useAutoHideControls(isMobile ? 0 : 3000);

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

  useEffect(() => {
    // 브라우저 종료/새로고침 감지
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { disconnect } = useSignalingStore.getState();
      disconnect(); // 즉시 연결 해제
      
      // 통화 중일 때만 경고 표시
      if (roomParams) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
      }
    };

    // 페이지 숨김 감지 (모바일 앱 전환 등)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[Room] 페이지가 숨겨짐 (백그라운드 전환)');
        // 필요시 추가 처리
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // 컴포넌트 언마운트 시 정리
      const { disconnect } = useSignalingStore.getState();
      disconnect();
      clearSession();
    };
  }, [roomParams]);
  
  // useEffect에 스트림 변경 감지 추가
  useEffect(() => {
    if (!roomParams) return;
    
    // MediaDeviceStore의 localStream 변경 감지
    const unsubscribe = useMediaDeviceStore.subscribe(
      (state) => {
        if (state.localStream && roomParams.localStream !== state.localStream) {
          console.log('[Room] Local stream changed, updating room params');
          
          // roomParams 업데이트 (불변성 유지)
          // 주의: roomParams는 useMemo로 생성되므로 직접 수정 불가
          // 대신 usePeerConnectionStore의 webRTCManager.updateLocalStream 호출
          const { webRTCManager } = usePeerConnectionStore.getState();
          if (webRTCManager) {
            webRTCManager.updateLocalStream(state.localStream);
          }
        }
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [roomParams]);

  useEffect(() => {
    return () => {
      clearSession();
    };
  }, [clearSession]);

  if (!connectionDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-screen bg-background flex flex-col relative overflow-hidden",
      isMobile && "h-[100dvh]" // 모바일에서 동적 뷰포트 높이 사용
    )}>
      {/* 비디오 레이아웃 */}
      <div className={cn(
        "flex-1 relative",
        isMobile && "pb-16" // 모바일에서 하단 컨트롤바 공간 확보
      )}>
        <VideoLayout />
      </div>

      {/* 사이드 패널들 - 모바일에서는 전체 화면 */}
      {isMobile ? (
        <>
          {/* 모바일 채팅 패널 - 전체 화면 */}
          {activePanel === "chat" && (
            <div className="fixed inset-0 z-50 bg-background">
              <ChatPanel 
                isOpen={true} 
                onClose={() => setActivePanel("none")} 
              />
            </div>
          )}

          {/* 모바일 화이트보드 - 전체 화면 */}
          {activePanel === "whiteboard" && (
            <div className="fixed inset-0 z-50 bg-background">
              <WhiteboardPanel 
                isOpen={true} 
                onClose={() => setActivePanel("none")} 
              />
            </div>
          )}

          {/* 모바일 설정 - 전체 화면 */}
          {activePanel === "settings" && (
            <div className="fixed inset-0 z-50">
              <SettingsPanel 
                isOpen={true} 
                onClose={() => setActivePanel("none")} 
              />
            </div>
          )}

          {/* 파일 스트리밍 - 전체 화면 */}
          {activePanel === "fileStreaming" && (
            <FileStreamingPanel
              isOpen={true}
              onClose={() => setActivePanel("none")}
            />
          )}
        </>
      ) : (
        <>
          {/* 데스크톱 사이드 패널들 */}
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

      {/* 컨트롤바 */}
      {!isMobile ? (
        // 데스크톱: 하단 중앙 플로팅
        <div className={cn(
          "absolute bottom-6 left-1/2 -translate-x-1/2 transition-all duration-300 z-30",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <ControlBar />
        </div>
      ) : (
        // 모바일: 항상 표시
        <ControlBar />
      )}
    </div>
  );
};

export default Room;