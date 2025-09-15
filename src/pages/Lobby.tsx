import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { DeviceSelector } from "@/components/DeviceSelector";
import { VideoPreview } from "@/components/VideoPreview";
import { toast } from "sonner";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { nanoid } from 'nanoid'; // 유니크한 사용자 ID 생성을 위해 추가

// Formula 2: Multi-Dimensional Analysis - Perfect preparation space
const Lobby = () => {
  const navigate = useNavigate();
  const {
    connectionDetails,
    isAudioEnabled,
    isVideoEnabled,
    audioLevel,
    selectedAudioDevice,
    selectedVideoDevice,
    stream,
    initialize,
    toggleAudio,
    toggleVideo,
    setSelectedAudioDevice,
    setSelectedVideoDevice,
    cleanup
  } = useLobbyStore();

  // 컴포넌트 내부 최상단 근처
  const joiningRef = useRef(false);

  // handleJoinRoom 함수 수정
  const handleJoinRoom = () => {
    const { stream, isAudioEnabled, isVideoEnabled, selectedAudioDevice, selectedVideoDevice, connectionDetails } = useLobbyStore.getState();

    if (!stream || !connectionDetails) {
        toast.error("Media stream or connection details are not available.");
        return;
    }
    
    // 유니크한 userId 생성
    const userId = nanoid();

    // 1) stream을 라우팅 state에서 제거
    // 2) 방 이동 전 joiningRef 설정
    joiningRef.current = true;
    navigate("/room", {
        state: {
            connectionDetails: {
                ...connectionDetails,
                userId: userId, // 생성된 userId 추가
            },
            mediaPreferences: {
                audioEnabled: isAudioEnabled,
                videoEnabled: isVideoEnabled,
                audioDeviceId: selectedAudioDevice,
                videoDeviceId: selectedVideoDevice,
            }
        }
    });

    // Lobby의 cleanup 함수는 호출하지 않음 (스트림을 넘겨줘야 하므로)
    toast.success("Joining the conversation...");
  };

  useEffect(() => {
    initialize(navigate, toast);

    return () => {
      // 방으로 실제로 들어갈 때는 Lobby 스트림 정리하지 않음
      if (!joiningRef.current) {
        cleanup();
      }
    };
  }, [navigate, initialize, cleanup]);


  if (!connectionDetails) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Get Ready to Connect
          </h1>
          <p className="text-muted-foreground">
            Joining <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span> as{" "}
            <span className="text-accent font-medium">{connectionDetails.nickname}</span>
          </p>
        </div>

        {/* Main Preview Area - Formula 2: Multi-dimensional time analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Camera Preview - Center Stage */}
          <div className="lg:col-span-2">
            <VideoPreview
              stream={stream}
              isVideoEnabled={isVideoEnabled}
              nickname={connectionDetails.nickname}
            />
          </div>

          {/* Controls & Settings - Right Panel */}
          <div className="space-y-6">
            {/* Voice Visualization - Real-time feedback */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Voice Check</h3>
              <div className="h-16 flex items-center justify-center">
                <VoiceVisualizer
                  audioLevel={audioLevel}
                  isActive={isAudioEnabled}
                  size="large"
                />
              </div>
              {isAudioEnabled && audioLevel > 0.1 && (
                <p className="text-success text-sm mt-2">🎤 Your voice sounds clear!</p>
              )}
            </div>

            {/* Device Selection */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Devices</h3>
              <DeviceSelector
                selectedAudioDevice={selectedAudioDevice}
                selectedVideoDevice={selectedVideoDevice}
                onAudioDeviceChange={setSelectedAudioDevice}
                onVideoDeviceChange={setSelectedVideoDevice}
              />
            </div>

            {/* Media Controls */}
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Controls</h3>
              <div className="flex gap-3">
                <Button
                  variant={isAudioEnabled ? "default" : "destructive"}
                  size="lg"
                  onClick={() => toggleAudio()}
                  className="flex-1"
                >
                  {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button
                  variant={isVideoEnabled ? "default" : "destructive"}
                  size="lg"
                  onClick={() => toggleVideo(toast)}
                  className="flex-1"
                >
                  {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Join Button */}
        <div className="text-center mt-8">
          <Button
            onClick={handleJoinRoom} // 수정된 핸들러 연결
            className="btn-connection px-12 py-4 text-lg"
          >
            Join Conversation
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;