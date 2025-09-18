import { io, Socket } from "socket.io-client";
import { SignalData } from "simple-peer";
import { ChatMessage } from "@/stores/useWebRTCStore"; // ChatMessage 타입을 가져옵니다.

// 이벤트 인터페이스 확장
interface SignalingEvents {
  onConnect: () => void;
  onDisconnect: () => void;
  onRoomUsers: (users: { id: string; nickname: string }[]) => void;
  onUserJoined: (user: { id: string; nickname: string }) => void;
  onUserLeft: (userId: string) => void;
  onSignal: (data: { from: string; signal: SignalData }) => void;
  onMediaState: (data: { userId: string; kind: 'audio' | 'video'; enabled: boolean }) => void;
  // ====================== [ ✨ 신규 추가 ✨ ] ======================
  // 채팅 메시지 수신 이벤트를 추가합니다.
  onChatMessage: (message: ChatMessage) => void;
  // ==============================================================
}

/**
 * SignalingClient 클래스: Socket.IO 통신을 캡슐화합니다.
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
    // ====================== [ ✨ 신규 추가 ✨ ] ======================
    // 서버로부터 오는 'chat-message' 이벤트를 리스닝합니다.
    this.socket.on("chat-message", this.events.onChatMessage);
    // ==============================================================
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

  // ====================== [ ✨ 신규 추가 ✨ ] ======================
  /**
   * Socket.IO를 통해 채팅 메시지를 전송합니다 (폴백용).
   * @param message 전송할 채팅 메시지 객체
   */
  public sendChatMessage(message: ChatMessage) {
    this.socket?.emit("chat-message", { message });
  }
  // ==============================================================
}
