/**
 * @fileoverview Lobby 페이지 (재설계)
 * @module pages/Lobby
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VideoPreview } from "@/components/VideoPreview";
import { DeviceSelector } from "@/components/DeviceSelector";
import { toast } from "sonner";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { nanoid } from 'nanoid';

const Lobby = () => {
  const navigate = useNavigate();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  const location = useLocation();
  const isMobile = useIsMobile();

  const { connectionDetails, isInitialized, initialize, cleanup } = useLobbyStore();
  
  const {
    localStream,
    audioInputs,
    videoInputs,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    isAudioEnabled,
    isVideoEnabled,
    toggleAudio,
    toggleVideo,
    changeAudioDevice,
    changeVideoDevice
  } = useMediaDeviceStore();

  const { setSession } = useSessionStore();

  /**
   * 초기화
   */
  useEffect(() => {
    const initialNickname = location.state?.nickname || '';
    
    if (!roomTitle) {
      toast.error("방 제목이 지정되지 않았습니다.");
      navigate('/');
      return;
    }

    initialize(roomTitle, initialNickname);

    return () => {
      cleanup();
    };
  }, [roomTitle, location.state, navigate, initialize, cleanup]);

  /**
   * 방 입장
   */
  const handleJoinRoom = () => {
    if (!connectionDetails || !isInitialized) {
      toast.error("아직 준비되지 않았습니다.");
      return;
    }

    const userId = nanoid();
    setSession(userId, connectionDetails.nickname, connectionDetails.roomTitle);

    navigate(`/room/${encodeURIComponent(connectionDetails.roomTitle)}`, {
      state: {
        connectionDetails: { ...connectionDetails, userId }
      }
    });

    toast.success("방에 입장합니다...");
  };

  /**
   * 디바이스 변경 핸들러
   */
  const handleAudioDeviceChange = (deviceId: string) => {
    changeAudioDevice(deviceId);
  };

  const handleVideoDeviceChange = (deviceId: string) => {
    changeVideoDevice(deviceId);
  };

  if (!isInitialized || !connectionDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  // 모바일 레이아웃
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background overflow-y-auto">
        <div className="flex flex-col p-4 pb-24">
          {/* 헤더 */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">준비하기</h1>
            <p className="text-sm text-muted-foreground">
              닉네임: <span className="text-accent font-medium">{connectionDetails.nickname}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              방: <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span>
            </p>
          </div>

          {/* 비디오 프리뷰 */}
          <div className="mb-6 aspect-video rounded-lg overflow-hidden bg-muted">
            <VideoPreview
              stream={localStream}
              isVideoEnabled={isVideoEnabled}
              nickname={connectionDetails.nickname}
              isLocalVideo={true}
            />
          </div>

          {/* 컨트롤 버튼 */}
          <div className="flex gap-3 mb-6">
            <Button
              variant={isAudioEnabled ? "default" : "destructive"}
              size="lg"
              onClick={toggleAudio}
              className="flex-1"
            >
              {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>
            <Button
              variant={isVideoEnabled ? "default" : "destructive"}
              size="lg"
              onClick={toggleVideo}
              className="flex-1"
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>
          </div>

          {/* 디바이스 선택 */}
          <div className="bg-card/50 backdrop-blur-sm rounded-lg p-4 mb-6 border border-border/50">
            <h3 className="text-sm font-medium mb-3">디바이스 설정</h3>
            <DeviceSelector
              audioDevices={audioInputs}
              videoDevices={videoInputs}
              selectedAudioDevice={selectedAudioDeviceId}
              selectedVideoDevice={selectedVideoDeviceId}
              onAudioDeviceChange={handleAudioDeviceChange}
              onVideoDeviceChange={handleVideoDeviceChange}
            />
          </div>
        </div>

        {/* 고정 Join 버튼 */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-xl border-t border-border/50">
          <Button
            onClick={handleJoinRoom}
            className="w-full h-12 text-lg btn-connection"
          >
            입장하기
          </Button>
        </div>
      </div>
    );
  }

  // 데스크톱 레이아웃
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">준비하기</h1>
          <p className="text-muted-foreground">
            닉네임: <span className="text-accent font-medium">{connectionDetails.nickname}</span>
          </p>
          <p className="text-muted-foreground mt-2">
            방: <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 비디오 프리뷰 */}
          <div className="lg:col-span-2">
            <VideoPreview
              stream={localStream}
              isVideoEnabled={isVideoEnabled}
              nickname={connectionDetails.nickname}
              isLocalVideo={true}
            />
          </div>

          {/* 사이드 패널 */}
          <div className="space-y-6">
            {/* 컨트롤 */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">컨트롤</h3>
              <div className="flex gap-3">
                <Button
                  variant={isAudioEnabled ? "default" : "destructive"}
                  size="lg"
                  onClick={toggleAudio}
                  className="flex-1"
                >
                  {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button
                  variant={isVideoEnabled ? "default" : "destructive"}
                  size="lg"
                  onClick={toggleVideo}
                  className="flex-1"
                >
                  {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            {/* 디바이스 선택 */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">디바이스</h3>
              <DeviceSelector
                audioDevices={audioInputs}
                videoDevices={videoInputs}
                selectedAudioDevice={selectedAudioDeviceId}
                selectedVideoDevice={selectedVideoDeviceId}
                onAudioDeviceChange={handleAudioDeviceChange}
                onVideoDeviceChange={handleVideoDeviceChange}
              />
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <Button onClick={handleJoinRoom} className="btn-connection px-12 py-4 text-lg">
            입장하기
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
