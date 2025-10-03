import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, MessageSquare,
  MoreVertical, PhoneOff, Settings, ScreenShare, ScreenShareOff,
  Captions, FileVideo, Palette, LayoutGrid, ChevronUp, X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useMediaDeviceStore } from '@/stores/useMediaDeviceStore';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';
import { MobileCameraToggle } from './MobileCameraToggle';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export const ControlBar = ({ isVertical = false }: { isVertical?: boolean }) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { 
    isAudioEnabled, 
    isVideoEnabled, 
    isSharingScreen,
    toggleAudio, 
    toggleVideo, 
    toggleScreenShare 
  } = useMediaDeviceStore();
  
  const { 
    activePanel, 
    viewMode, 
    unreadMessageCount, 
    setActivePanel, 
    setViewMode,
    controlBarSize
  } = useUIManagementStore();
  
  const { 
    isTranscriptionEnabled, 
    toggleTranscription 
  } = useTranscriptionStore();

  const handleLeave = () => {
    navigate('/');
    toast.info("You have left the room.");
  };

  const handleMobilePanelOpen = (panel: string) => {
    setActivePanel(panel as any);
    setIsDrawerOpen(false);
  };
  
  const iconSize = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-5 h-5",
  };

  const buttonPadding = {
    sm: "p-2",
    md: "p-2.5",
    lg: "p-3",
  };

  const separatorMargin = {
    sm: isVertical ? "my-1" : "mx-1",
    md: isVertical ? "my-1.5" : "mx-1.5",
    lg: isVertical ? "my-2" : "mx-2",
  }

  if (!isMobile) {
    return (
      <div className={cn(
          "control-panel flex items-center gap-1.5 backdrop-blur-xl rounded-full shadow-lg border border-border/50",
          isVertical ? "flex-col p-1.5" : "flex-row p-1.5"
      )}>
        <div className={cn("flex items-center gap-1", isVertical ? "flex-col" : "flex-row")}>
          <Button
            variant={isAudioEnabled ? "ghost" : "destructive"}
            onClick={toggleAudio}
            className={cn("rounded-full", buttonPadding[controlBarSize])}
            title={isAudioEnabled ? "마이크 끄기" : "마이크 켜기"}
          >
            {isAudioEnabled ? <Mic className={iconSize[controlBarSize]} /> : <MicOff className={iconSize[controlBarSize]} />}
          </Button>

          <Button
            variant={isVideoEnabled ? "ghost" : "destructive"}
            onClick={toggleVideo}
            className={cn("rounded-full", buttonPadding[controlBarSize])}
            title={isVideoEnabled ? "비디오 끄기" : "비디오 켜기"}
          >
            {isVideoEnabled ? <Video className={iconSize[controlBarSize]} /> : <VideoOff className={iconSize[controlBarSize]} />}
          </Button>

          <Button
            variant="destructive"
            onClick={handleLeave}
            className={cn("rounded-full", buttonPadding[controlBarSize])}
            title="나가기"
          >
            <PhoneOff className={iconSize[controlBarSize]} />
          </Button>
        </div>

        <div className={cn("bg-border/50", isVertical ? "w-full h-px" : "w-px h-6", separatorMargin[controlBarSize])} />

        <div className={cn("flex items-center gap-1", isVertical ? "flex-col" : "flex-row")}>
          <div className="relative">
            <Button
              variant={activePanel === "chat" ? "default" : "secondary"}
              onClick={() => setActivePanel("chat")}
              className={cn("rounded-full", buttonPadding[controlBarSize])}
              title="채팅"
            >
              <MessageSquare className={iconSize[controlBarSize]} />
            </Button>
            {unreadMessageCount > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
                variant="destructive"
              >
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </Badge>
            )}
          </div>

          <Button
            variant={isSharingScreen ? "default" : "secondary"}
            onClick={() => toggleScreenShare()}
            className={cn("rounded-full", buttonPadding[controlBarSize])}
            title={isSharingScreen ? "화면 공유 중지" : "화면 공유"}
          >
            {isSharingScreen ? (
              <ScreenShareOff className={cn(iconSize[controlBarSize], "text-destructive-foreground")} />
            ) : (
              <ScreenShare className={iconSize[controlBarSize]} />
            )}
          </Button>

          <Button
            variant={isTranscriptionEnabled ? "default" : "secondary"}
            onClick={toggleTranscription}
            className={cn("rounded-full", buttonPadding[controlBarSize])}
            title={isTranscriptionEnabled ? "자막 끄기" : "자막 켜기"}
          >
            <Captions className={iconSize[controlBarSize]} />
          </Button>
        </div>

        <div className={cn("bg-border/50", isVertical ? "w-full h-px" : "w-px h-6", separatorMargin[controlBarSize])} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className={cn("rounded-full", buttonPadding[controlBarSize])} title="더보기">
              <MoreVertical className={iconSize[controlBarSize]} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="mb-2 w-56">
             <DropdownMenuItem onClick={() => setActivePanel("whiteboard")}>
              <Palette className="w-4 h-4 mr-2" />
              Whiteboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setActivePanel("fileStreaming")}>
              <FileVideo className="w-4 h-4 mr-2" />
              Stream File
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setViewMode(viewMode === 'speaker' ? 'grid' : 'speaker')}>
              <LayoutGrid className="w-4 h-4 mr-2" />
              {viewMode === 'speaker' ? 'Grid View' : 'Speaker View'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setActivePanel("settings")}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Mobile View
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom z-50">
        <div className="flex items-center justify-around px-2 py-2">
          <Button variant={isAudioEnabled ? "ghost" : "destructive"} size="sm" onClick={toggleAudio} className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1">
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            <span className="text-[10px]">{isAudioEnabled ? "Mute" : "Unmute"}</span>
          </Button>
          <Button variant={isVideoEnabled ? "ghost" : "destructive"} size="sm" onClick={toggleVideo} className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1">
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            <span className="text-[10px]">{isVideoEnabled ? "Stop" : "Start"}</span>
          </Button>
          <MobileCameraToggle />
          <div className="relative">
            <Button variant={activePanel === "chat" ? "default" : "ghost"} size="sm" onClick={() => setActivePanel("chat")} className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1">
              <MessageSquare className="w-5 h-5" />
              <span className="text-[10px]">Chat</span>
            </Button>
            {unreadMessageCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]" variant="destructive">
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </Badge>
            )}
          </div>
          <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="sm" className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1">
                <ChevronUp className="w-5 h-5" />
                <span className="text-[10px]">More</span>
              </Button>
            </DrawerTrigger>
            <DrawerContent className="pb-safe">
              <DrawerHeader className="pb-2"><DrawerTitle>Options</DrawerTitle></DrawerHeader>
              <div className="px-4 pb-8 space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => {
                    toggleScreenShare();
                    setIsDrawerOpen(false);
                  }}
                >
                  {isSharingScreen ? (
                    <ScreenShareOff className="w-5 h-5 mr-3 text-destructive" />
                  ) : (
                    <ScreenShare className="w-5 h-5 mr-3" />
                  )}
                  <span>{isSharingScreen ? "화면 공유 중지" : "화면 공유"}</span>
                </Button>
                <Button variant="ghost" className="w-full justify-start h-14 text-left" onClick={() => { toggleTranscription(); setIsDrawerOpen(false); }}>
                  <Captions className="w-5 h-5 mr-3" />
                  <span>Subtitles {isTranscriptionEnabled && '(On)'}</span>
                </Button>
                <Button variant="ghost" className="w-full justify-start h-14 text-left" onClick={() => handleMobilePanelOpen("whiteboard")}>
                  <Palette className="w-5 h-5 mr-3" />
                  <span>Whiteboard</span>
                </Button>
                <Button variant="ghost" className="w-full justify-start h-14 text-left" onClick={() => handleMobilePanelOpen("fileStreaming")}>
                  <FileVideo className="w-5 h-5 mr-3" />
                  <span>Stream File</span>
                </Button>
                <Button variant="ghost" className="w-full justify-start h-14 text-left" onClick={() => { setViewMode(viewMode === 'speaker' ? 'grid' : 'speaker'); setIsDrawerOpen(false); }}>
                  <LayoutGrid className="w-5 h-5 mr-3" />
                  <span>{viewMode === 'speaker' ? 'Grid View' : 'Speaker View'}</span>
                </Button>
                <Button variant="ghost" className="w-full justify-start h-14 text-left" onClick={() => handleMobilePanelOpen("settings")}>
                  <Settings className="w-5 h-5 mr-3" />
                  <span>Settings</span>
                </Button>
                <div className="h-px bg-border my-4" />
                <Button variant="destructive" className="w-full h-14" onClick={handleLeave}>
                  <PhoneOff className="w-5 h-5 mr-3" />
                  <span>Leave Room</span>
                </Button>
              </div>
            </DrawerContent>
          </Drawer>
          <Button variant="destructive" size="sm" onClick={handleLeave} className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1">
            <PhoneOff className="w-5 h-5" />
            <span className="text-[10px]">Leave</span>
          </Button>
        </div>
      </div>
      <div className="h-16 safe-area-bottom" />
    </>
  );
};
