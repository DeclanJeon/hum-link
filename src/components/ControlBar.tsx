import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, MessageSquare,
  MoreVertical, PhoneOff, Settings, ScreenShare, 
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

export const ControlBar = () => {
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
    setViewMode 
  } = useUIManagementStore();
  
  const { 
    isTranscriptionEnabled, 
    toggleTranscription 
  } = useTranscriptionStore();

  const handleLeave = () => {
    navigate('/');
    toast.info("You have left the room.");
  };

  // 모바일에서 패널 열기
  const handleMobilePanelOpen = (panel: string) => {
    setActivePanel(panel as any);
    setIsDrawerOpen(false);
  };

  // 데스크톱 뷰
  if (!isMobile) {
    return (
      <div className="control-panel flex items-center gap-3 px-6 py-3 bg-background/95 backdrop-blur-xl rounded-2xl shadow-lg border border-border/50">
        {/* Core Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={isAudioEnabled ? "ghost" : "destructive"}
            size="lg"
            onClick={toggleAudio}
            className="rounded-full"
          >
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </Button>

          <Button
            variant={isVideoEnabled ? "ghost" : "destructive"}
            size="lg"
            onClick={toggleVideo}
            className="rounded-full"
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </Button>

          <Button
            variant="destructive"
            size="lg"
            onClick={handleLeave}
            className="rounded-full"
          >
            <PhoneOff className="w-5 h-5" />
          </Button>
        </div>

        <div className="w-px h-8 bg-border/50" />

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant={activePanel === "chat" ? "default" : "secondary"}
              size="lg"
              onClick={() => setActivePanel("chat")}
              className="rounded-full"
            >
              <MessageSquare className="w-5 h-5" />
            </Button>
            {unreadMessageCount > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center"
                variant="destructive"
              >
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </Badge>
            )}
          </div>

          <Button
            variant="secondary"
            size="lg"
            onClick={() => toggleScreenShare(toast)}
            className="rounded-full"
          >
            <ScreenShare className="w-5 h-5" />
          </Button>

          <Button
            variant={isTranscriptionEnabled ? "default" : "secondary"}
            size="lg"
            onClick={toggleTranscription}
            className="rounded-full"
          >
            <Captions className="w-5 h-5" />
          </Button>
        </div>

        <div className="w-px h-8 bg-border/50" />

        {/* Advanced Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="lg" className="rounded-full">
              <MoreVertical className="w-5 h-5" />
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

            <DropdownMenuItem 
              onClick={() => setViewMode(viewMode === 'speaker' ? 'grid' : 'speaker')}
            >
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

  // 모바일 뷰
  return (
    <>
      {/* 모바일 하단 고정 컨트롤바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom z-50">
        <div className="flex items-center justify-around px-2 py-2">
          {/* 마이크 토글 */}
          <Button
            variant={isAudioEnabled ? "ghost" : "destructive"}
            size="sm"
            onClick={toggleAudio}
            className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
          >
            {isAudioEnabled ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
            <span className="text-[10px]">
              {isAudioEnabled ? "Mute" : "Unmute"}
            </span>
          </Button>

          {/* 비디오 토글 */}
          <Button
            variant={isVideoEnabled ? "ghost" : "destructive"}
            size="sm"
            onClick={toggleVideo}
            className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
          >
            {isVideoEnabled ? (
              <Video className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
            <span className="text-[10px]">
              {isVideoEnabled ? "Stop" : "Start"}
            </span>
          </Button>

          {/* 카메라 전환 (모바일만) */}
          <MobileCameraToggle />

          {/* 채팅 */}
          <div className="relative">
            <Button
              variant={activePanel === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("chat")}
              className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-[10px]">Chat</span>
            </Button>
            {unreadMessageCount > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                variant="destructive"
              >
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </Badge>
            )}
          </div>

          {/* 더보기 메뉴 (Drawer) */}
          <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
              >
                <ChevronUp className="w-5 h-5" />
                <span className="text-[10px]">More</span>
              </Button>
            </DrawerTrigger>
            <DrawerContent className="pb-safe">
              <DrawerHeader className="pb-2">
                <DrawerTitle>Options</DrawerTitle>
              </DrawerHeader>
              
              <div className="px-4 pb-8 space-y-2">
                {/* 화면 공유 */}
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => {
                    toggleScreenShare(toast);
                    setIsDrawerOpen(false);
                  }}
                >
                  <ScreenShare className="w-5 h-5 mr-3" />
                  <span>Share Screen</span>
                </Button>

                {/* 자막 */}
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => {
                    toggleTranscription();
                    setIsDrawerOpen(false);
                  }}
                >
                  <Captions className="w-5 h-5 mr-3" />
                  <span>Subtitles {isTranscriptionEnabled && '(On)'}</span>
                </Button>

                {/* 화이트보드 */}
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => handleMobilePanelOpen("whiteboard")}
                >
                  <Palette className="w-5 h-5 mr-3" />
                  <span>Whiteboard</span>
                </Button>

                {/* 파일 스트리밍 */}
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => handleMobilePanelOpen("fileStreaming")}
                >
                  <FileVideo className="w-5 h-5 mr-3" />
                  <span>Stream File</span>
                </Button>

                {/* 뷰 모드 */}
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => {
                    setViewMode(viewMode === 'speaker' ? 'grid' : 'speaker');
                    setIsDrawerOpen(false);
                  }}
                >
                  <LayoutGrid className="w-5 h-5 mr-3" />
                  <span>{viewMode === 'speaker' ? 'Grid View' : 'Speaker View'}</span>
                </Button>

                {/* 설정 */}
                <Button
                  variant="ghost"
                  className="w-full justify-start h-14 text-left"
                  onClick={() => handleMobilePanelOpen("settings")}
                >
                  <Settings className="w-5 h-5 mr-3" />
                  <span>Settings</span>
                </Button>

                <div className="h-px bg-border my-4" />

                {/* 통화 종료 */}
                <Button
                  variant="destructive"
                  className="w-full h-14"
                  onClick={handleLeave}
                >
                  <PhoneOff className="w-5 h-5 mr-3" />
                  <span>Leave Room</span>
                </Button>
              </div>
            </DrawerContent>
          </Drawer>

          {/* 통화 종료 (항상 표시) */}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLeave}
            className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="text-[10px]">Leave</span>
          </Button>
        </div>
      </div>

      {/* 모바일에서 하단 여백 확보 */}
      <div className="h-16 safe-area-bottom" />
    </>
  );
};