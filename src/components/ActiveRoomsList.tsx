import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Video, Mic, UserCheck, Clock, ArrowRight, Trash2, AlertTriangle } from "lucide-react";
import { RoomInfo, RoomType } from "@/types/room";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";

interface ActiveRoomsListProps {
  rooms: RoomInfo[];
  onJoinRoom: (room: RoomInfo) => void;
  onDeleteRoom: (roomId: string) => void;
  currentUserId?: string;
}

const getRoomTypeConfig = (type: RoomType) => {
  switch (type) {
    case 'group-voice':
      return { 
        icon: Mic, 
        title: '소그룹 음성', 
        color: 'bg-blue-500',
        variant: 'default' as const
      };
    case 'group-video':
      return { 
        icon: Video, 
        title: '소그룹 화상', 
        color: 'bg-green-500',
        variant: 'secondary' as const
      };
    case 'one-on-one-voice':
      return { 
        icon: UserCheck, 
        title: '1:1 음성', 
        color: 'bg-orange-500',
        variant: 'outline' as const
      };
    case 'one-on-one-video':
      return { 
        icon: Users, 
        title: '1:1 화상', 
        color: 'bg-pink-500',
        variant: 'destructive' as const
      };
  }
};

export const ActiveRoomsList = ({ rooms, onJoinRoom, onDeleteRoom, currentUserId }: ActiveRoomsListProps) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  if (rooms.length === 0) {
    return (
      <Alert>
        <Users className="w-4 h-4" />
        <AlertDescription>
          현재 활성화된 방이 없습니다. 새로운 방을 생성하여 대화를 시작해보세요.
        </AlertDescription>
      </Alert>
    );
  }

  const totalPages = Math.ceil(rooms.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentRooms = rooms.slice(startIndex, startIndex + itemsPerPage);

  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    onDeleteRoom(roomId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          활성 방 ({rooms.length}개)
        </h3>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            그리드
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            목록
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[60vh]">
        <div className={viewMode === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" 
          : "space-y-3"
        }>
          {currentRooms.map((room) => {
            const config = getRoomTypeConfig(room.type);
            const Icon = config.icon;
            const isRoomFull = room.currentParticipants >= room.maxParticipants;
            const canDelete = currentUserId === room.createdBy;
            
            return (
              <Card key={room.id} className="hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base leading-tight truncate">
                          {room.title}
                        </CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {config.title}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={config.variant} className="text-xs">
                        {room.currentParticipants}/{room.maxParticipants}
                      </Badge>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteRoom(e, room.id)}
                          className="w-8 h-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatDistanceToNow(new Date(room.createdAt), { 
                          addSuffix: true, 
                          locale: ko 
                        })}
                      </span>
                    </div>
                    
                    <Button 
                      size="sm" 
                      onClick={() => onJoinRoom(room)}
                      disabled={isRoomFull}
                      className="gap-1"
                    >
                      {isRoomFull ? '가득함' : '참여'}
                      {!isRoomFull && <ArrowRight className="w-3 h-3" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground flex items-center px-3">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
};