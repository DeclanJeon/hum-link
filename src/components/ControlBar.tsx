import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { 
  Mic, MicOff, Video, VideoOff, MessageSquare, Palette,
  MoreHorizontal, PhoneOff, Settings, LayoutGrid, ScreenShare, Captions
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { useUIManagementStore, ViewMode } from '@/stores/useUIManagementStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';

// <<< [수정] Props 인터페이스 제거 또는 최소화
// interface ControlBarProps { ... }

export const ControlBar = () => {
  const navigate = useNavigate();

  // --- 스토어에서 직접 상태와 액션 가져오기 ---
  const { isAudioEnabled, isVideoEnabled, isSharingScreen, toggleAudio, toggleVideo, toggleScreenShare } = useMediaDeviceStore();
  const { activePanel, viewMode, unreadMessageCount, setActivePanel, setViewMode } = useUIManagementStore();
  const { isTranscriptionEnabled, toggleTranscription } = useTranscriptionStore();

  // Room.tsx의 cleanup 로직을 가져옵니다. 
  // 실제로는 useRoomOrchestrator 같은 곳에 통합된 cleanup 함수를 호출하는 것이 더 좋습니다.
  // 여기서는 간단하게 navigate만 처리합니다.
  const handleLeave = () => {
    // Cleanup 로직은 useRoomOrchestrator에서 처리되므로 여기서는 페이지 이동만 담당합니다.
    navigate('/');
    toast.info("You have left the room.");
  };

  return (
    <div className="control-panel flex items-center gap-3 px-6 py-3">
      {/* Core Controls */}
      <Button
        variant={isAudioEnabled ? "secondary" : "destructive"}
        size="lg"
        onClick={toggleAudio}
        className={`fab ${isAudioEnabled ? "" : "active"}`}
      >
        {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>

      <Button
        variant={isVideoEnabled ? "secondary" : "destructive"}
        size="lg"
        onClick={toggleVideo}
        className={`fab ${isVideoEnabled ? "" : "active"}`}
      >
        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </Button>

      <div className="w-px h-8 bg-border/50 mx-2" />

      {/* Transcription Toggle */}
      <Button
        variant="secondary"
        size="lg"
        onClick={toggleTranscription}
        className={`fab ${isTranscriptionEnabled ? "active" : ""}`}
      >
        <Captions className="w-5 h-5" />
      </Button>

      {/* Collaboration Tools */}
      <div className="relative">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setActivePanel("chat")}
          className={`fab ${activePanel === "chat" ? "active" : ""}`}
        >
          <MessageSquare className="w-5 h-5" />
        </Button>
        {unreadMessageCount > 0 && (
          <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground pointer-events-none">
            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
          </div>
        )}
      </div>

      <Button
        variant="secondary"
        size="lg"
        onClick={() => setActivePanel("whiteboard")}
        className={`fab ${activePanel === "whiteboard" ? "active" : ""}`}
      >
        <Palette className="w-5 h-5" />
      </Button>
      
      <Button
        variant="secondary"
        size="lg"
        onClick={() => toggleScreenShare(toast)}
        className={`fab ${isSharingScreen ? "active" : ""}`}
      >
        <ScreenShare className="w-5 h-5" />
      </Button>

      {/* View Mode Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="lg" className="fab">
            <LayoutGrid className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2">
          <DropdownMenuItem onClick={() => setViewMode('speaker')} disabled={viewMode === 'speaker'}>
            Speaker View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setViewMode('grid')} disabled={viewMode === 'grid'}>
            Grid View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* More Actions Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="lg" className="fab">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2">
          <DropdownMenuItem onClick={() => setActivePanel("settings")}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-8 bg-border/50 mx-2" />
      
      {/* Leave Button */}
      <Button
        variant="destructive"
        size="lg"
        onClick={handleLeave}
        className="fab bg-destructive hover:bg-destructive/80"
      >
        <PhoneOff className="w-5 h-5" />
      </Button>
    </div>
  );
};
