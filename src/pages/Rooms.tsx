import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Users, Video, Mic, UserCheck, Clock, ArrowRight, Trash2, 
  Search, Filter, Grid3X3, List, Home, Plus
} from "lucide-react";
import { RoomInfo, RoomType } from "@/types/room";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useRoomStore } from "@/stores/useRoomStore";
import { useLandingStore } from "@/stores/useLandingStore";
import { toast } from "sonner";

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

const Rooms = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<RoomType | "all">("all");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const { rooms, deleteRoom, loadRoomsFromDB } = useRoomStore();
  const { nickname, generateRandomNickname } = useLandingStore();

  useEffect(() => {
    loadRoomsFromDB();
  }, [loadRoomsFromDB]);

  // Filter and search logic
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         room.createdBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === "all" || room.type === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredRooms.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentRooms = filteredRooms.slice(startIndex, startIndex + itemsPerPage);

  const handleJoinRoom = (room: RoomInfo) => {
    const userNickname = nickname.trim() || generateRandomNickname();
    navigate(`/lobby/${encodeURIComponent(room.title)}`, {
      state: { 
        nickname: userNickname,
        roomInfo: room 
      }
    });
  };

  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    deleteRoom(roomId);
    toast.success("방이 삭제되었습니다");
  };

  const roomTypeFilters = [
    { value: "all" as const, label: "모든 방", count: rooms.length },
    { value: "group-voice" as const, label: "소그룹 음성", count: rooms.filter(r => r.type === "group-voice").length },
    { value: "group-video" as const, label: "소그룹 화상", count: rooms.filter(r => r.type === "group-video").length },
    { value: "one-on-one-voice" as const, label: "1:1 음성", count: rooms.filter(r => r.type === "one-on-one-voice").length },
    { value: "one-on-one-video" as const, label: "1:1 화상", count: rooms.filter(r => r.type === "one-on-one-video").length },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card/50 backdrop-blur-sm border-b border-border/50 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                홈으로
              </Button>
              
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold text-foreground">활성 방 목록</h1>
                <Badge variant="secondary" className="ml-2">
                  {filteredRooms.length}개
                </Badge>
              </div>
            </div>

            <Button onClick={() => navigate('/')} className="gap-2">
              <Plus className="w-4 h-4" />
              새 방 만들기
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Filters and Search */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="방 제목이나 생성자로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="gap-2"
              >
                <Grid3X3 className="w-4 h-4" />
                그리드
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="gap-2"
              >
                <List className="w-4 h-4" />
                목록
              </Button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {roomTypeFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={selectedFilter === filter.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedFilter(filter.value);
                  setCurrentPage(1);
                }}
                className="gap-2"
              >
                <Filter className="w-3 h-3" />
                {filter.label}
                <Badge variant="secondary" className="text-xs">
                  {filter.count}
                </Badge>
              </Button>
            ))}
          </div>
        </div>

        {/* Rooms Grid/List */}
        {currentRooms.length === 0 ? (
          <Alert>
            <Users className="w-4 h-4" />
            <AlertDescription>
              {searchQuery || selectedFilter !== "all" 
                ? "검색 조건에 맞는 방이 없습니다."
                : "현재 활성화된 방이 없습니다. 새로운 방을 생성해보세요."
              }
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className={
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
                : "space-y-4"
            }>
              {currentRooms.map((room) => {
                const config = getRoomTypeConfig(room.type);
                const Icon = config.icon;
                const isRoomFull = room.currentParticipants >= room.maxParticipants;
                const canDelete = nickname === room.createdBy;
                
                return (
                  <Card 
                    key={room.id} 
                    className="hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer group"
                    onClick={() => handleJoinRoom(room)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-12 h-12 rounded-xl ${config.color} flex items-center justify-center flex-shrink-0`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg leading-tight truncate group-hover:text-primary transition-colors">
                              {room.title}
                            </CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {config.title}
                            </CardDescription>
                            <CardDescription className="text-xs mt-1 text-muted-foreground">
                              생성자: {room.createdBy}
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
                              className="w-8 h-8 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
                          disabled={isRoomFull}
                          className="gap-1 pointer-events-none"
                          onClick={(e) => e.stopPropagation()}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  이전
                </Button>
                
                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page > totalPages) return null;
                    
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-10 h-10"
                      >
                        {page}
                      </Button>
                    );
                  })}
                  
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <>
                      <span className="text-muted-foreground">...</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        className="w-10 h-10"
                      >
                        {totalPages}
                      </Button>
                    </>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  다음
                </Button>
              </div>
            )}

            {/* Results Info */}
            <div className="text-center mt-6 text-sm text-muted-foreground">
              총 {filteredRooms.length}개의 방 중 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredRooms.length)}번째 표시
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Rooms;