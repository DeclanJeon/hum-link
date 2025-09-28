import { useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DeviceSelector } from "@/components/DeviceSelector";
import { VideoPreview } from "@/components/VideoPreview";
import { toast } from "sonner";
import { Mic, MicOff, Video, VideoOff, Volume2, CheckCircle, AlertCircle } from "lucide-react";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { nanoid } from 'nanoid';
import { cn } from "@/lib/utils";

// 오디오 레벨 인디케이터 - 임시 비활성화
const AudioLevelIndicator = ({ audioLevel, isEnabled }: { audioLevel: number; isEnabled: boolean }) => {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {isEnabled ? (
          <Volume2 className="w-4 h-4 text-muted-foreground" />
        ) : (
          <MicOff className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {!isEnabled ? (
          <span className="text-red-500">Muted</span>
        ) : (
          <span className="text-green-500">Ready</span>
        )}
      </div>
    </div>
  );
};

const Lobby = () => {
  const navigate = useNavigate();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  const location = useLocation();
  const isMobile = useIsMobile();

  const {
    connectionDetails, isAudioEnabled, isVideoEnabled,
    selectedAudioDevice, selectedVideoDevice, audioDevices, videoDevices, stream,
    initialize, toggleAudio, toggleVideo, setSelectedAudioDevice, setSelectedVideoDevice, cleanup,
    mediaCapabilities
  } = useLobbyStore();

  const { setSession } = useSessionStore();
  const joiningRef = useRef(false);

  const handleJoinRoom = () => {
    const { isAudioEnabled, isVideoEnabled, selectedAudioDevice, selectedVideoDevice, connectionDetails } = useLobbyStore.getState();

    if (!connectionDetails) {
      toast.error("Connection details are not available.");
      return;
    }
    
    joiningRef.current = true;
    
    const userId = nanoid();
    setSession(userId, connectionDetails.nickname, connectionDetails.roomTitle);
    
    navigate(`/room/${encodeURIComponent(connectionDetails.roomTitle)}`, {
      state: {
        connectionDetails: { ...connectionDetails, userId },
        mediaPreferences: {
          audioEnabled: isAudioEnabled,
          videoEnabled: isVideoEnabled,
          audioDeviceId: selectedAudioDevice,
          videoDeviceId: selectedVideoDevice,
        }
      }
    });

    toast.success("Joining the conversation...");
  };

  useEffect(() => {
    const initialNickname = location.state?.nickname || '';
    if (!roomTitle) {
      toast.error("No room specified. Redirecting to home.");
      navigate('/');
      return;
    }
    initialize(roomTitle, initialNickname, navigate, toast);

    return () => {
      if (!joiningRef.current) {
        cleanup();
      }
    };
  }, [roomTitle, location.state, navigate, initialize, cleanup]);

  const handleAudioDeviceChange = (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    const device = audioDevices.find(d => d.deviceId === deviceId);
    toast.success(`Switched to ${device?.label || "new microphone"}`);
  };

  const handleVideoDeviceChange = (deviceId: string) => {
    setSelectedVideoDevice(deviceId);
    const device = videoDevices.find(d => d.deviceId === deviceId);
    toast.success(`Switched to ${device?.label || "new camera"}`);
  };

  if (!connectionDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading room...</p>
      </div>
    );
  }

  // 모바일 뷰
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background overflow-y-auto">
        <div className="flex flex-col p-4 pb-24">
          {/* 헤더 */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Get Ready</h1>
            <p className="text-sm text-muted-foreground">
              Room: <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Nickname: <span className="text-accent font-medium">{connectionDetails.nickname}</span>
            </p>
          </div>

          {/* 비디오 프리뷰 */}
          <div className="mb-6 aspect-video rounded-lg overflow-hidden bg-muted">
            <VideoPreview
              stream={stream}
              isVideoEnabled={isVideoEnabled}
              nickname={connectionDetails.nickname || "You"}
              isLocalVideo={true}
            />
          </div>

          {/* 오디오 체크 - 간소화 */}
          <div className="bg-card/50 backdrop-blur-sm rounded-lg p-4 mb-4 border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Audio Check</h3>
              {mediaCapabilities?.hasMicrophone ? (
                isAudioEnabled ? (
                  <div className="flex items-center gap-1 text-green-500">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Ready</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">Muted</span>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-1 text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">No mic</span>
                </div>
              )}
            </div>
            <AudioLevelIndicator audioLevel={0} isEnabled={isAudioEnabled} />
          </div>

          {/* 컨트롤 버튼 */}
          <div className="flex gap-3 mb-6">
            <Button
              variant={isAudioEnabled ? "default" : "destructive"}
              size="lg"
              onClick={toggleAudio}
              className="flex-1"
              disabled={!mediaCapabilities?.hasMicrophone}
            >
              {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>
            <Button
              variant={isVideoEnabled ? "default" : "destructive"}
              size="lg"
              onClick={() => toggleVideo(toast)}
              className="flex-1"
              disabled={!mediaCapabilities?.hasCamera}
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>
          </div>

          {/* 디바이스 선택 */}
          <div className="bg-card/50 backdrop-blur-sm rounded-lg p-4 mb-6 border border-border/50">
            <h3 className="text-sm font-medium mb-3">Devices</h3>
            <DeviceSelector
              audioDevices={audioDevices}
              videoDevices={videoDevices}
              selectedAudioDevice={selectedAudioDevice}
              selectedVideoDevice={selectedVideoDevice}
              onAudioDeviceChange={handleAudioDeviceChange}
              onVideoDeviceChange={handleVideoDeviceChange}
            />
          </div>
        </div>

        {/* 하단 고정 Join 버튼 */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-xl border-t border-border/50">
          <Button 
            onClick={handleJoinRoom} 
            className="w-full h-12 text-lg btn-connection"
          >
            Join Conversation
          </Button>
        </div>
      </div>
    );
  }

  // 데스크톱 뷰
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Get Ready to Connect</h1>
          <p className="text-muted-foreground">
            Joining <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span> as{" "}
            <span className="text-accent font-medium">{connectionDetails.nickname}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <VideoPreview
              stream={stream}
              isVideoEnabled={isVideoEnabled}
              nickname={connectionDetails.nickname || "You"}
              isLocalVideo={true}
            />
          </div>

          <div className="space-y-6">
            {/* 오디오 체크 - 간소화 */}
            <div className="control-panel">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-foreground">Audio Check</h3>
                {mediaCapabilities?.hasMicrophone && isAudioEnabled && (
                  <div className="flex items-center gap-1 text-green-500 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Ready</span>
                  </div>
                )}
              </div>
              <AudioLevelIndicator audioLevel={0} isEnabled={isAudioEnabled} />
              {!mediaCapabilities?.hasMicrophone && (
                <p className="text-xs text-yellow-500 mt-2">No microphone detected</p>
              )}
            </div>

            {/* 디바이스 선택 */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Devices</h3>
              <DeviceSelector
                audioDevices={audioDevices}
                videoDevices={videoDevices}
                selectedAudioDevice={selectedAudioDevice}
                selectedVideoDevice={selectedVideoDevice}
                onAudioDeviceChange={handleAudioDeviceChange}
                onVideoDeviceChange={handleVideoDeviceChange}
              />
            </div>

            {/* 컨트롤 */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Controls</h3>
              <div className="flex gap-3">
                <Button 
                  variant={isAudioEnabled ? "default" : "destructive"} 
                  size="lg" 
                  onClick={toggleAudio} 
                  className="flex-1"
                  disabled={!mediaCapabilities?.hasMicrophone}
                >
                  {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button 
                  variant={isVideoEnabled ? "default" : "destructive"} 
                  size="lg" 
                  onClick={() => toggleVideo(toast)} 
                  className="flex-1"
                  disabled={!mediaCapabilities?.hasCamera}
                >
                  {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <Button onClick={handleJoinRoom} className="btn-connection px-12 py-4 text-lg">
            Join Conversation
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
