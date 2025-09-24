import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Paperclip } from "lucide-react";
import { useChatStore, ChatMessage } from "@/stores/useChatStore";
import { usePeerConnectionStore } from "@/stores/usePeerConnectionStore"; 
import { FileMessage } from "./FileMessage";
import { nanoid } from "nanoid";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel = ({ isOpen, onClose }: ChatPanelProps) => {
  const { chatMessages, isTyping, addMessage } = useChatStore();
  // ✅ 수정: sendToAllPeers와 sendFile 액션 가져오기
  const { sendToAllPeers, sendFile } = usePeerConnectionStore();
  
  const userId = 'local-user'; 
  const nickname = 'You';

  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendTypingState = (isTyping: boolean) => {
    const data = { type: 'typing-state', payload: { isTyping } };
    sendToAllPeers(JSON.stringify(data));
  };

  const sendChatMessage = (text: string) => {
    if (!userId || !nickname) return;
    
    const message: ChatMessage = { id: nanoid(), type: 'text', text, senderId: userId, senderNickname: nickname, timestamp: Date.now() };
    addMessage(message);
    const data = { type: 'chat', payload: message };
    sendToAllPeers(JSON.stringify(data));
  }

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      sendChatMessage(newMessage);
      setNewMessage("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTypingState(false);
    }
  };

  // ✅ 수정: 파일 선택 시 sendFile 액션 호출
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      sendFile(file); // 파일 전송 시작
    }
    // 입력 필드 초기화
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAttachClick = () => fileInputRef.current?.click();
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (!typingTimeoutRef.current) {
      sendTypingState(true);
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingState(false);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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