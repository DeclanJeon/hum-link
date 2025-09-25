import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLandingStore } from "@/stores/useLandingStore";
import { useRoomStore } from "@/stores/useRoomStore";
import { RoomTypeSelector } from "@/components/RoomTypeSelector";
import { ActiveRoomsList } from "@/components/ActiveRoomsList";
import { RoomType } from "@/types/room";

const Landing = () => {
  const navigate = useNavigate();
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  
  const { 
    roomTitle, 
    nickname, 
    setRoomTitle, 
    setNickname, 
    generateRandomNickname 
  } = useLandingStore();

  const { 
    rooms, 
    createRoom, 
    loadRoomsFromDB 
  } = useRoomStore();

  useEffect(() => {
    loadRoomsFromDB();
  }, [loadRoomsFromDB]);

  const handleNicknameGenerate = () => {
    generateRandomNickname();
    toast("Perfect! This name suits you", { duration: 2000 });
  };

  const handleCreateRoom = async () => {
    if (!selectedRoomType || !roomTitle.trim()) {
      toast.error("방 제목과 타입을 선택해주세요");
      return;
    }

    const userNickname = nickname.trim() || generateRandomNickname();
    
    try {
      const newRoom = await createRoom(roomTitle, selectedRoomType, userNickname);
      
      navigate(`/lobby/${encodeURIComponent(newRoom.title)}`, {
        state: { 
          nickname: userNickname,
          roomType: selectedRoomType,
          roomId: newRoom.id
        }
      });
      
      toast.success("방이 생성되었습니다!");
    } catch (error) {
      toast.error("방 생성에 실패했습니다");
    }
  };

  const handleJoinRoom = (room: any) => {
    const userNickname = nickname.trim() || generateRandomNickname();
    
    navigate(`/lobby/${encodeURIComponent(room.title)}`, {
      state: { 
        nickname: userNickname,
        roomType: room.type,
        roomId: room.id
      }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-breathing" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-breathing" style={{ animationDelay: "2s" }} />

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 text-gradient animate-breathing">
            Singularity
          </h1>
          <p className="text-muted-foreground text-lg">
            다양한 방식으로 소통하고 연결되세요
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Left Column: Create Room */}
          <div className="space-y-6">
            <div className="bg-card/50 backdrop-blur-sm rounded-lg border border-border/50 p-6">
              <h2 className="text-2xl font-semibold mb-6">새 방 만들기</h2>
              
              {!showCreateRoom ? (
                <div className="space-y-4">
                  <RoomTypeSelector 
                    selectedType={selectedRoomType}
                    onTypeSelect={setSelectedRoomType}
                  />
                  
                  {selectedRoomType && (
                    <Button 
                      onClick={() => setShowCreateRoom(true)}
                      className="w-full"
                    >
                      방 설정하기
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowCreateRoom(false)}
                    className="mb-4"
                  >
                    ← 뒤로가기
                  </Button>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="roomTitle" className="text-foreground font-medium">
                        방 제목
                      </Label>
                      <Input
                        id="roomTitle"
                        placeholder="방 이름을 입력하세요..."
                        value={roomTitle}
                        onChange={(e) => setRoomTitle(e.target.value)}
                        className="h-12 text-lg bg-input/50 backdrop-blur-sm border-border/50 focus:border-primary/50 focus:ring-primary/20"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="nickname" className="text-foreground font-medium">
                          닉네임 <span className="text-muted-foreground text-sm">(선택사항)</span>
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleNicknameGenerate}
                          className="text-primary hover:text-primary-glow text-sm"
                        >
                          랜덤 생성
                        </Button>
                      </div>
                      <Input
                        id="nickname"
                        placeholder="비워두면 자동으로 생성됩니다..."
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="h-12 text-lg bg-input/50 backdrop-blur-sm border-border/50 focus:border-primary/50 focus:ring-primary/20"
                      />
                    </div>

                    <Button
                      onClick={handleCreateRoom}
                      className="w-full h-12 text-lg btn-connection"
                      disabled={!roomTitle.trim() || !selectedRoomType}
                    >
                      방 생성하기
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Active Rooms */}
          <div className="space-y-6">
            <div className="bg-card/50 backdrop-blur-sm rounded-lg border border-border/50 p-6">
              <h2 className="text-2xl font-semibold mb-6">활성 방 목록</h2>
              
              <ActiveRoomsList 
                rooms={rooms}
                onJoinRoom={handleJoinRoom}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-muted-foreground text-sm">
          실시간으로 연결되는 새로운 소통 경험
        </div>
      </div>
    </div>
  );
};

export default Landing;
