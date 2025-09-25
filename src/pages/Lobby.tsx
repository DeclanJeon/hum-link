import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { DeviceSelector } from "@/components/DeviceSelector";
import { VideoPreview } from "@/components/VideoPreview";
import { toast } from "sonner";
import { Mic, MicOff, Video, VideoOff, Edit3, Check, X, Users, Clock } from "lucide-react";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { nanoid } from 'nanoid';
import { RoomInfo, RoomType } from "@/types/room";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

const getRoomTypeConfig = (type: RoomType) => {
  switch (type) {
    case 'group-voice':
      return { icon: Mic, title: '소그룹 음성', maxParticipants: 8, color: 'bg-blue-500' };
    case 'group-video':
      return { icon: Video, title: '소그룹 화상', maxParticipants: 4, color: 'bg-green-500' };
    case 'one-on-one-voice':
      return { icon: Users, title: '1:1 음성', maxParticipants: 2, color: 'bg-orange-500' };
    case 'one-on-one-video':
      return { icon: Users, title: '1:1 화상', maxParticipants: 2, color: 'bg-pink-500' };
  }
};

const Lobby = () => {
  const navigate = useNavigate();
  const { roomTitle } = useParams<{ roomTitle: string }>();
  const location = useLocation();
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [tempNickname, setTempNickname] = useState('');

  const {
    connectionDetails, isAudioEnabled, isVideoEnabled, audioLevel,
    selectedAudioDevice, selectedVideoDevice, audioDevices, videoDevices, stream,
    initialize, toggleAudio, toggleVideo, setSelectedAudioDevice, setSelectedVideoDevice, cleanup
  } = useLobbyStore();

  const joiningRef = useRef(false);
  const roomInfo = location.state?.roomInfo as RoomInfo | undefined;

  const handleJoinRoom = () => {
    const { isAudioEnabled, isVideoEnabled, selectedAudioDevice, selectedVideoDevice, connectionDetails } = useLobbyStore.getState();

    if (!connectionDetails) {
        toast.error("Connection details are not available.");
        return;
    }
    
    joiningRef.current = true;
    
    navigate(`/room/${encodeURIComponent(connectionDetails.roomTitle)}`, {
        state: {
            connectionDetails: { ...connectionDetails, userId: nanoid() },
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

  const handleEditNickname = () => {
    setTempNickname(connectionDetails?.nickname || '');
    setIsEditingNickname(true);
  };

  const handleSaveNickname = () => {
    if (tempNickname.trim() && connectionDetails) {
      // Update nickname in connection details
      const { updateNickname } = useLobbyStore.getState();
      if (updateNickname) {
        updateNickname(tempNickname.trim());
      }
      setIsEditingNickname(false);
      toast.success("닉네임이 변경되었습니다");
    }
  };

  const handleCancelEdit = () => {
    setIsEditingNickname(false);
    setTempNickname('');
  };

  if (!connectionDetails) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p>Loading room...</p></div>;
  }

  const config = roomInfo ? getRoomTypeConfig(roomInfo.type) : null;
  const RoomIcon = config?.icon || Users;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 lg:p-6">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            {config && (
              <div className={`w-12 h-12 rounded-xl ${config.color} flex items-center justify-center`}>
                <RoomIcon className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">방 입장 준비</h1>
              {config && (
                <Badge variant="secondary" className="mt-1">
                  {config.title} • 최대 {config.maxParticipants}명
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <span>방 제목:</span>
            <span className="text-primary font-medium">"{connectionDetails.roomTitle}"</span>
          </div>
          
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-muted-foreground">참여자:</span>
            {isEditingNickname ? (
              <div className="flex items-center gap-2">
                <Input
                  value={tempNickname}
                  onChange={(e) => setTempNickname(e.target.value)}
                  className="w-32 h-8 text-sm"
                  placeholder="닉네임 입력"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNickname();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={handleSaveNickname}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-accent font-medium">{connectionDetails.nickname || '...'}</span>
                <Button size="sm" variant="ghost" onClick={handleEditNickname}>
                  <Edit3 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {roomInfo && (
            <div className="flex items-center justify-center gap-4 mt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{roomInfo.currentParticipants}/{roomInfo.maxParticipants}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatDistanceToNow(new Date(roomInfo.createdAt), { addSuffix: true, locale: ko })}</span>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <div className="relative">
              <VideoPreview
                stream={stream}
                isVideoEnabled={isVideoEnabled}
                nickname={connectionDetails.nickname || "You"}
                isLocalVideo={true}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-muted/30 rounded-lg flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="control-panel bg-card rounded-lg p-4 border">
              <h3 className="font-medium text-foreground mb-4 flex items-center gap-2">
                <Mic className="w-4 h-4" />
                음성 확인
              </h3>
              <div className="h-16 flex items-center justify-center">
                <VoiceVisualizer audioLevel={audioLevel} isActive={isAudioEnabled} size="large" />
              </div>
              {isAudioEnabled && audioLevel > 0.1 && (
                <p className="text-green-600 text-sm mt-2 text-center">음성이 정상적으로 감지됩니다!</p>
              )}
              {isAudioEnabled && audioLevel <= 0.1 && (
                <p className="text-yellow-600 text-sm mt-2 text-center">마이크가 음소거되었거나 소리를 감지할 수 없습니다</p>
              )}
            </div>
            
            <div className="control-panel bg-card rounded-lg p-4 border">
              <h3 className="font-medium text-foreground mb-4">장치 설정</h3>
              <DeviceSelector
                audioDevices={audioDevices}
                videoDevices={videoDevices}
                selectedAudioDevice={selectedAudioDevice}
                selectedVideoDevice={selectedVideoDevice}
                onAudioDeviceChange={handleAudioDeviceChange}
                onVideoDeviceChange={handleVideoDeviceChange}
              />
            </div>
            
            <div className="control-panel bg-card rounded-lg p-4 border">
              <h3 className="font-medium text-foreground mb-4">미디어 제어</h3>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant={isAudioEnabled ? "default" : "destructive"} 
                  size="lg" 
                  onClick={toggleAudio} 
                  className="w-full"
                >
                  {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  <span className="ml-2 hidden sm:inline">
                    {isAudioEnabled ? "음소거" : "음성 켜기"}
                  </span>
                </Button>
                <Button 
                  variant={isVideoEnabled ? "default" : "destructive"} 
                  size="lg" 
                  onClick={() => toggleVideo(toast)} 
                  className="w-full"
                >
                  {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  <span className="ml-2 hidden sm:inline">
                    {isVideoEnabled ? "카메라 끄기" : "카메라 켜기"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-center mt-8">
          <Button onClick={handleJoinRoom} className="btn-connection px-12 py-4 text-lg">
            대화방 입장
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
