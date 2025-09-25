import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Video, Mic, UserCheck } from "lucide-react";
import { RoomType } from "@/types/room";

interface RoomTypeSelectorProps {
  selectedType: RoomType | null;
  onTypeSelect: (type: RoomType) => void;
}

const roomTypes = [
  {
    type: 'group-voice' as RoomType,
    title: '소그룹 음성채팅',
    description: '최대 8명까지 참여 가능',
    icon: Mic,
    maxParticipants: 8,
    gradient: 'from-blue-500 to-purple-600'
  },
  {
    type: 'group-video' as RoomType,
    title: '소그룹 화상채팅',
    description: '최대 4명까지 참여 가능',
    icon: Video,
    maxParticipants: 4,
    gradient: 'from-green-500 to-teal-600'
  },
  {
    type: 'one-on-one-voice' as RoomType,
    title: '1:1 음성채팅',
    description: '개인 대화',
    icon: UserCheck,
    maxParticipants: 2,
    gradient: 'from-orange-500 to-red-600'
  },
  {
    type: 'one-on-one-video' as RoomType,
    title: '1:1 화상채팅',
    description: '개인 영상통화',
    icon: Users,
    maxParticipants: 2,
    gradient: 'from-pink-500 to-rose-600'
  }
];

export const RoomTypeSelector = ({ selectedType, onTypeSelect }: RoomTypeSelectorProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {roomTypes.map(({ type, title, description, icon: Icon, maxParticipants, gradient }) => (
        <Card 
          key={type}
          className={`cursor-pointer transition-all duration-200 hover:scale-105 ${
            selectedType === type 
              ? 'ring-2 ring-primary bg-primary/5' 
              : 'hover:shadow-lg'
          }`}
          onClick={() => onTypeSelect(type)}
        >
          <CardHeader className="pb-2">
            <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${gradient} flex items-center justify-center mb-2`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="text-sm">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>최대 인원</span>
              <span className="font-medium">{maxParticipants}명</span>
            </div>
            {selectedType === type && (
              <Button className="w-full mt-3" size="sm">
                선택됨
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};