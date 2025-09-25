import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Video, Mic, UserCheck, Clock, ArrowRight } from "lucide-react";
import { RoomInfo, RoomType } from "@/types/room";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface ActiveRoomsListProps {
  rooms: RoomInfo[];
  onJoinRoom: (room: RoomInfo) => void;
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

export const ActiveRoomsList = ({ rooms, onJoinRoom }: ActiveRoomsListProps) => {
  if (rooms.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          활성 방이 없습니다
        </h3>
        <p className="text-sm text-muted-foreground">
          새로운 방을 생성하여 대화를 시작해보세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        활성 방 ({rooms.length}개)
      </h3>
      
      <div className="grid gap-3">
        {rooms.map((room) => {
          const config = getRoomTypeConfig(room.type);
          const Icon = config.icon;
          const isRoomFull = room.currentParticipants >= room.maxParticipants;
          
          return (
            <Card key={room.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">
                        {room.title}
                      </CardTitle>
                      <CardDescription className="text-sm mt-1">
                        {config.title}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <Badge variant={config.variant} className="text-xs">
                    {room.currentParticipants}/{room.maxParticipants}
                  </Badge>
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
                    {isRoomFull ? '가득참' : '참여'}
                    {!isRoomFull && <ArrowRight className="w-3 h-3" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};