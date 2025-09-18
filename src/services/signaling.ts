import { io, Socket } from "socket.io-client";
import { SignalData } from "simple-peer";

// 시그널링 서버로부터 수신할 이벤트에 대한 콜백 인터페이스
interface SignalingEvents {
  onConnect: () => void;
  onDisconnect: () => void;
  onRoomUsers: (users: { id: string; nickname: string }[]) => void;
  onUserJoined: (user: { id: string; nickname: string }) => void;
  onUserLeft: (userId: string) => void;
  onSignal: (data: { from: string; signal: SignalData }) => void;
  onMediaState: (data: { userId: string; kind: 'audio' | 'video'; enabled: boolean }) => void;
}

/**
 * SignalingClient 클래스
 * Socket.IO를 사용하여 시그널링 서버와의 모든 통신을 캡슐화합니다.
 */
export class SignalingClient {
  private socket: Socket | null = null;
  private events: SignalingEvents;

  constructor(events: SignalingEvents) {
    this.events = events;
  }

  public connect(url: string, userId: string, nickname: string, roomId: string) {
    this.socket = io(url);

    this.socket.on("connect", () => {
      this.events.onConnect();
      this.joinRoom(roomId, userId, nickname);
    });

    this.socket.on("disconnect", this.events.onDisconnect);
    this.socket.on("room-users", this.events.onRoomUsers);
    this.socket.on("user-joined", this.events.onUserJoined);
    this.socket.on("user-left", this.events.onUserLeft);
    this.socket.on("signal", this.events.onSignal);
    this.socket.on("media-state-updated", this.events.onMediaState);
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  private joinRoom(roomId: string, userId: string, nickname: string) {
    this.socket?.emit("join-room", { roomId, userId, nickname });
  }

  public sendSignal(to: string, signal: SignalData) {
    this.socket?.emit("signal", { to, signal });
  }

  public updateMediaState(kind: 'audio' | 'video', enabled: boolean) {
    this.socket?.emit("update-media-state", { kind, enabled });
  }

  public sendScreenShareState(enabled: boolean) {
    this.socket?.emit("screen-share-state", { enabled });
  }
}