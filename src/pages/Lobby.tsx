import { useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { DeviceSelector } from "@/components/DeviceSelector";
import { VideoPreview } from "@/components/VideoPreview";
import { toast } from "sonner";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { nanoid } from 'nanoid';

const Lobby = () => {
  const navigate = useNavigate();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  const location = useLocation();

  const {
    connectionDetails, isAudioEnabled, isVideoEnabled, audioLevel,
    selectedAudioDevice, selectedVideoDevice, audioDevices, videoDevices, stream,
    initialize, toggleAudio, toggleVideo, setSelectedAudioDevice, setSelectedVideoDevice, cleanup
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
    
    // Generate unique userId and set session
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
    return <div className="min-h-screen bg-background flex items-center justify-center"><p>Loading room...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Get Ready to Connect</h1>
          <p className="text-muted-foreground">
            Joining <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span> as{" "}
            <span className="text-accent font-medium">{connectionDetails.nickname || '...'}</span>
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
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Voice Check</h3>
              <div className="h-16 flex items-center justify-center">
                <VoiceVisualizer audioLevel={audioLevel} isActive={isAudioEnabled} size="large" />
              </div>
              {isAudioEnabled && audioLevel > 0.1 && (
                <p className="text-success text-sm mt-2">✓ Your voice sounds clear!</p>
              )}
            </div>
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
            <div className="control-panel">
              <h3 className="font-medium text-foreground mb-4">Controls</h3>
              <div className="flex gap-3">
                <Button variant={isAudioEnabled ? "default" : "destructive"} size="lg" onClick={toggleAudio} className="flex-1">
                  {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>
                <Button variant={isVideoEnabled ? "default" : "destructive"} size="lg" onClick={() => toggleVideo(toast)} className="flex-1">
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
