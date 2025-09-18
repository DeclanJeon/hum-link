import { Button } from "@/components/ui/button";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MessageSquare, 
  Palette,
  MoreHorizontal,
  PhoneOff,
  Settings,
  LayoutGrid, // 변경점: 아이콘 추가
  ScreenShare
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ViewMode } from "@/stores/useWebRTCStore"; // 변경점: 타입 import

interface ControlBarProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean; // 변경점: 화면 공유 상태 prop 추가
  activePanel: "none" | "chat" | "whiteboard" | "settings";
  viewMode: ViewMode; // 변경점: 현재 뷰 모드 prop 추가
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleChat: () => void;
  onToggleWhiteboard: () => void;
  onScreenShare: () => void;
  onOpenSettings: () => void;
  onSetViewMode: (mode: ViewMode) => void; // 변경점: 뷰 모드 변경 함수 prop 추가
  onLeave: () => void;
}

export const ControlBar = ({
  isAudioEnabled,
  isVideoEnabled,
  isSharingScreen, // 변경점: prop 사용
  activePanel,
  viewMode,
  onToggleAudio,
  onToggleVideo,
  onToggleChat,
  onToggleWhiteboard,
  onScreenShare,
  onOpenSettings,
  onSetViewMode,
  onLeave
}: ControlBarProps) => {
  return (
    <div className="control-panel flex items-center gap-3 px-6 py-3">
      {/* Core Controls */}
      <Button
        variant={isAudioEnabled ? "secondary" : "destructive"}
        size="lg"
        onClick={onToggleAudio}
        className={`fab ${isAudioEnabled ? "" : "active"}`}
      >
        {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>

      <Button
        variant={isVideoEnabled ? "secondary" : "destructive"}
        size="lg"
        onClick={onToggleVideo}
        className={`fab ${isVideoEnabled ? "" : "active"}`}
      >
        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </Button>

      <div className="w-px h-8 bg-border/50 mx-2" />

      {/* Collaboration Tools */}
      <Button
        variant="secondary"
        size="lg"
        onClick={onToggleChat}
        className={`fab ${activePanel === "chat" ? "active" : ""}`}
      >
        <MessageSquare className="w-5 h-5" />
      </Button>

      <Button
        variant="secondary"
        size="lg"
        onClick={onToggleWhiteboard}
        className={`fab ${activePanel === "whiteboard" ? "active" : ""}`}
      >
        <Palette className="w-5 h-5" />
      </Button>
      
      {/* 변경점: isSharingScreen 상태에 따라 버튼 스타일을 동적으로 변경 */}
      <Button
        variant="secondary"
        size="lg"
        onClick={onScreenShare}
        className={`fab ${isSharingScreen ? "active" : ""}`}
      >
        <ScreenShare className="w-5 h-5" />
      </Button>

      {/* 변경점: 뷰 모드 변경 드롭다운 메뉴 추가 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="lg" className="fab">
            <LayoutGrid className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2">
          <DropdownMenuItem onClick={() => onSetViewMode('speaker')} disabled={viewMode === 'speaker'}>
            Speaker View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetViewMode('grid')} disabled={viewMode === 'grid'}>
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
          <DropdownMenuItem onClick={onOpenSettings}>
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
        onClick={onLeave}
        className="fab bg-destructive hover:bg-destructive/80"
      >
        <PhoneOff className="w-5 h-5" />
      </Button>
    </div>
  );
};
