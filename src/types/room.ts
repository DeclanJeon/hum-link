export type RoomType = 'group-voice' | 'group-video' | 'one-on-one-voice' | 'one-on-one-video';

export interface RoomInfo {
  id: string;
  title: string;
  type: RoomType;
  currentParticipants: number;
  maxParticipants: number;
  createdAt: number;
  createdBy: string;
  isActive: boolean;
}

export interface ActiveRoomState {
  rooms: RoomInfo[];
  currentRoom: RoomInfo | null;
}