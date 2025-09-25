import { create } from 'zustand';
import { RoomInfo, RoomType } from '@/types/room';
import { nanoid } from 'nanoid';

const DB_NAME = 'SingularityRoomDB';
const DB_VERSION = 1;
const STORE_NAME = 'rooms';

interface RoomStore {
  rooms: RoomInfo[];
  currentRoom: RoomInfo | null;
  
  // Actions
  createRoom: (title: string, type: RoomType, createdBy: string) => Promise<RoomInfo>;
  updateRoom: (roomId: string, updates: Partial<RoomInfo>) => void;
  deleteRoom: (roomId: string) => void;
  setCurrentRoom: (room: RoomInfo | null) => void;
  loadRoomsFromDB: () => Promise<void>;
  saveRoomToDB: (room: RoomInfo) => Promise<void>;
  removeRoomFromDB: (roomId: string) => Promise<void>;
  updateRoomParticipants: (roomId: string, count: number) => void;
}

let db: IDBDatabase | null = null;

const initDB = async (): Promise<void> => {
  if (db) return;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
  });
};

const saveRoomToIndexedDB = async (room: RoomInfo): Promise<void> => {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(room);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadRoomsFromIndexedDB = async (): Promise<RoomInfo[]> => {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const rooms = request.result.filter((room: RoomInfo) => room.isActive);
      resolve(rooms);
    };
    request.onerror = () => reject(request.error);
  });
};

const removeRoomFromIndexedDB = async (roomId: string): Promise<void> => {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(roomId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: [],
  currentRoom: null,

  createRoom: async (title: string, type: RoomType, createdBy: string) => {
    const maxParticipants = type.includes('group') 
      ? (type === 'group-voice' ? 8 : 4)
      : 2;

    const newRoom: RoomInfo = {
      id: nanoid(),
      title,
      type,
      currentParticipants: 1,
      maxParticipants,
      createdAt: Date.now(),
      createdBy,
      isActive: true,
    };

    await saveRoomToIndexedDB(newRoom);
    
    set(state => ({
      rooms: [...state.rooms, newRoom],
      currentRoom: newRoom
    }));

    return newRoom;
  },

  updateRoom: (roomId: string, updates: Partial<RoomInfo>) => {
    set(state => ({
      rooms: state.rooms.map(room => 
        room.id === roomId ? { ...room, ...updates } : room
      ),
      currentRoom: state.currentRoom?.id === roomId 
        ? { ...state.currentRoom, ...updates }
        : state.currentRoom
    }));
  },

  deleteRoom: (roomId: string) => {
    removeRoomFromIndexedDB(roomId);
    set(state => ({
      rooms: state.rooms.filter(room => room.id !== roomId),
      currentRoom: state.currentRoom?.id === roomId ? null : state.currentRoom
    }));
  },

  setCurrentRoom: (room: RoomInfo | null) => {
    set({ currentRoom: room });
  },

  loadRoomsFromDB: async () => {
    try {
      const rooms = await loadRoomsFromIndexedDB();
      set({ rooms });
    } catch (error) {
      console.error('Failed to load rooms from DB:', error);
    }
  },

  saveRoomToDB: async (room: RoomInfo) => {
    try {
      await saveRoomToIndexedDB(room);
    } catch (error) {
      console.error('Failed to save room to DB:', error);
    }
  },

  removeRoomFromDB: async (roomId: string) => {
    try {
      await removeRoomFromIndexedDB(roomId);
    } catch (error) {
      console.error('Failed to remove room from DB:', error);
    }
  },

  updateRoomParticipants: (roomId: string, count: number) => {
    const { updateRoom } = get();
    updateRoom(roomId, { currentParticipants: count });
  },
}));