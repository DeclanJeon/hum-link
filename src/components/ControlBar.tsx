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
  ScreenShare,
  Captions // [추가]
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ViewMode } from "@/stores/useUIManagementStore"; // [수정] ViewMode의 정확한 출처는 useUIManagementStore 입니다.
import { useIsMobile } from "@/hooks/use-mobile";

interface ControlBarProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSharingScreen: boolean; // 변경점: 화면 공유 상태 prop 추가
  activePanel: "none" | "chat" | "whiteboard" | "settings";
  viewMode: ViewMode; // 변경점: 현재 뷰 모드 prop 추가
  // ====================== [ ✨ 신규 추가 ✨ ] ======================
  unreadMessageCount: number;
  // ==============================================================
  // [추가] 자막 관련 props
  isTranscriptionEnabled: boolean; // [추가]
  onToggleTranscription: () => void; // [추가]
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
  // ====================== [ ✨ 신규 추가 ✨ ] ======================
  unreadMessageCount,
  // ==============================================================
  // [추가] 자막 관련 props
  isTranscriptionEnabled,
  onToggleTranscription,
  onToggleAudio,
  onToggleVideo,
  onToggleChat,
  onToggleWhiteboard,
  onScreenShare,
  onOpenSettings,
  onSetViewMode,
  onLeave
}: ControlBarProps) => {
  const isMobile = useIsMobile();
  return (
    <div className={`control-panel flex items-center ${isMobile ? 'gap-2 px-3 py-2' : 'gap-3 px-6 py-3'} ${isMobile ? 'flex-wrap justify-center' : ''}`}>
      {/* Core Controls */}
      <Button
        variant={isAudioEnabled ? "secondary" : "destructive"}
        size={isMobile ? "default" : "lg"}
        onClick={onToggleAudio}
        className={`fab ${isAudioEnabled ? "" : "active"} ${isMobile ? 'w-10 h-10' : ''}`}
      >
        {isAudioEnabled ? <Mic className={isMobile ? "w-4 h-4" : "w-5 h-5"} /> : <MicOff className={isMobile ? "w-4 h-4" : "w-5 h-5"} />}
      </Button>

      <Button
        variant={isVideoEnabled ? "secondary" : "destructive"}
        size={isMobile ? "default" : "lg"}
        onClick={onToggleVideo}
        className={`fab ${isVideoEnabled ? "" : "active"} ${isMobile ? 'w-10 h-10' : ''}`}
      >
        {isVideoEnabled ? <Video className={isMobile ? "w-4 h-4" : "w-5 h-5"} /> : <VideoOff className={isMobile ? "w-4 h-4" : "w-5 h-5"} />}
      </Button>

      {!isMobile && <div className="w-px h-8 bg-border/50 mx-2" />}

      {/* [추가] 자막 토글 버튼 */}
      <Button
        variant="secondary"
        size={isMobile ? "default" : "lg"}
        onClick={onToggleTranscription}
        className={`fab ${isTranscriptionEnabled ? "active" : ""} ${isMobile ? 'w-10 h-10' : ''}`}
      >
        <Captions className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
      </Button>

      {/* Collaboration Tools */}
      {/* ====================== [ 🚀 UI 수정 🚀 ] ====================== */}
      <div className="relative">
        <Button
          variant="secondary"
          size={isMobile ? "default" : "lg"}
          onClick={onToggleChat}
          className={`fab ${activePanel === "chat" ? "active" : ""} ${isMobile ? 'w-10 h-10' : ''}`}
        >
          <MessageSquare className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
        </Button>
        {unreadMessageCount > 0 && (
          <div className={`absolute -top-1 -right-1 flex h-${isMobile ? '4' : '5'} w-${isMobile ? '4' : '5'} items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground pointer-events-none`}>
            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
          </div>
        )}
      </div>
      {/* ============================================================== */}

      <Button
        variant="secondary"
        size={isMobile ? "default" : "lg"}
        onClick={onToggleWhiteboard}
        className={`fab ${activePanel === "whiteboard" ? "active" : ""} ${isMobile ? 'w-10 h-10' : ''}`}
      >
        <Palette className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
      </Button>
      
      {/* 변경점: isSharingScreen 상태에 따라 버튼 스타일을 동적으로 변경 */}
      {!isMobile && (
        <Button
          variant="secondary"
          size="lg"
          onClick={onScreenShare}
          className={`fab ${isSharingScreen ? "active" : ""}`}
        >
          <ScreenShare className="w-5 h-5" />
        </Button>
      )}

      {/* Mobile: Combined More Actions Menu */}
      {isMobile ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="default" className="fab w-10 h-10">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="mb-2">
            <DropdownMenuItem onClick={() => onSetViewMode('speaker')} disabled={viewMode === 'speaker'}>
              <LayoutGrid className="w-4 h-4 mr-2" />
              Speaker View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetViewMode('grid')} disabled={viewMode === 'grid'}>
              <LayoutGrid className="w-4 h-4 mr-2" />
              Grid View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onScreenShare}>
              <ScreenShare className="w-4 h-4 mr-2" />
              {isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSettings}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
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
        </>
      )}

      {!isMobile && <div className="w-px h-8 bg-border/50 mx-2" />}
      
      {/* Leave Button */}
      <Button
        variant="destructive"
        size={isMobile ? "default" : "lg"}
        onClick={onLeave}
        className={`fab bg-destructive hover:bg-destructive/80 ${isMobile ? 'w-10 h-10' : ''}`}
      >
        <PhoneOff className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
      </Button>
    </div>
  );
};
