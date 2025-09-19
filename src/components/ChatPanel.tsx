import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Paperclip } from "lucide-react";
import { useChatStore, ChatMessage } from "@/stores/useChatStore";
import { useWebRTCStore } from "@/stores/useWebRTCStore";
import { FileMessage } from "./FileMessage";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel = ({ isOpen, onClose }: ChatPanelProps) => {
  const { chatMessages, isTyping } = useChatStore();
  const { sendChatMessage, sendFile, sendTypingState, userId } = useWebRTCStore();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      sendChatMessage(newMessage);
      setNewMessage("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTypingState(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendFile(file);
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAttachClick = () => fileInputRef.current?.click();
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    // 타이핑 상태 전송 로직
    if (!typingTimeoutRef.current) {
      sendTypingState(true);
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingState(false);
      typingTimeoutRef.current = null;
    }, 2000); // 2초 후 타이핑 중지 전송
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // "입력 중"인 사용자 닉네임 목록을 생성합니다.
  const typingUsers = useMemo(() => Array.from(isTyping.values()), [isTyping]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-card/95 backdrop-blur-xl border-l border-border/50 shadow-[var(--shadow-elegant)] z-40 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border/30">
        <h3 className="font-semibold text-foreground">Chat</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {chatMessages.map((message: ChatMessage) => (
            <div key={message.id} className={`flex ${message.senderId === userId ? "justify-end" : "justify-start"}`}>
              {message.type === 'file' && message.fileMeta ? (
                <FileMessage message={message} />
              ) : (
                <div className="max-w-[85%] space-y-1">
                  <div className={`chat-bubble ${message.senderId === userId ? "own" : ""}`}>
                    <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
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
      
      {/* 타이핑 인디케이터 UI */}
      <div className="h-6 px-4 text-xs text-muted-foreground italic transition-opacity duration-300">
        {typingUsers.length > 0 && (
          <p>{typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing...</p>
        )}
      </div>

      <div className="p-4 border-t border-border/30">
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          <Button variant="ghost" size="sm" onClick={handleAttachClick} className="px-3"><Paperclip className="w-4 h-4" /></Button>
          <Input
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-input/50 border-border/50"
          />
          <Button onClick={handleSendMessage} disabled={!newMessage.trim()} size="sm" className="px-3"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
};
