import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Paperclip } from "lucide-react"; // Paperclip 아이콘 추가
import { useChatStore, ChatMessage } from "@/stores/useChatStore"; // ChatMessage 타입 import
import { useWebRTCStore } from "@/stores/useWebRTCStore";
import { FileMessage } from "./FileMessage"; // 새로 만들 컴포넌트

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel = ({ isOpen, onClose }: ChatPanelProps) => {
  const { chatMessages } = useChatStore();
  const { sendChatMessage, sendFile, userId } = useWebRTCStore(); // sendFile 액션 가져오기
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // 파일 입력을 위한 ref

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  
    const handleSendMessage = () => {
      if (newMessage.trim()) {
        sendChatMessage(newMessage);
        setNewMessage("");
      }
    };
    
    // ====================== [ 파일 공유 기능 추가 ] ======================
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        sendFile(file);
      }
      // 같은 파일을 다시 선택할 수 있도록 value를 초기화합니다.
      if(fileInputRef.current) fileInputRef.current.value = "";
    };
  
    const handleAttachClick = () => {
      fileInputRef.current?.click();
    };
    // =================================================================
  
    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    };
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-card/95 backdrop-blur-xl border-l border-border/50 shadow-[var(--shadow-elegant)] z-40">
      <div className="flex items-center justify-between p-4 border-b border-border/30">
        <h3 className="font-semibold text-foreground">Chat</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
        <div className="p-4 space-y-4">
          {chatMessages.map((message: ChatMessage) => ( // 타입 명시
            <div
              key={message.id}
              className={`flex ${message.senderId === userId ? "justify-end" : "justify-start"}`}
            >
              {message.type === 'file' && message.fileMeta ? (
                <FileMessage message={message} />
              ) : (
                <div className="max-w-[85%] space-y-1">
                  <div className={`chat-bubble ${message.senderId === userId ? "own" : ""}`}>
                    <p className="text-sm">{message.text}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{message.senderNickname}</span>
                    <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border/30">
        <div className="flex gap-2">
          {/* ====================== [ 파일 공유 기능 추가 ] ====================== */}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          <Button variant="ghost" size="sm" onClick={handleAttachClick} className="px-3">
            <Paperclip className="w-4 h-4" />
          </Button>
          {/* ================================================================= */}
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-input/50 border-border/50"
          />
          <Button onClick={handleSendMessage} disabled={!newMessage.trim()} size="sm" className="px-3">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
