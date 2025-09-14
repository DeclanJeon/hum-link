import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Pin } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
}

interface ChatPanelProps {
  onClose: () => void;
}

// Formula 6: Insight Amplification - Chat as visual conversation part
export const ChatPanel = ({ onClose }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hey! Great to connect with you here.",
      sender: "Remote Participant",
      timestamp: new Date(Date.now() - 300000),
      isOwn: false
    },
    {
      id: "2", 
      text: "Absolutely! This interface feels really smooth.",
      sender: "You",
      timestamp: new Date(Date.now() - 240000),
      isOwn: true
    }
  ]);
  const [newMessage, setNewMessage] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(),
      text: newMessage.trim(),
      sender: "You",
      timestamp: new Date(),
      isOwn: true
    };

    setMessages(prev => [...prev, message]);
    setNewMessage("");

    // Simulate response after a delay
    setTimeout(() => {
      const responses = [
        "That's a great point!",
        "I totally agree with that.",
        "Let me think about that for a moment.",
        "Interesting perspective!",
        "Could you elaborate on that?"
      ];
      
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: responses[Math.floor(Math.random() * responses.length)],
        sender: "Remote Participant",
        timestamp: new Date(),
        isOwn: false
      };
      
      setMessages(prev => [...prev, response]);
    }, 1000 + Math.random() * 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const addToWhiteboard = (message: Message) => {
    toast.success("Message added to whiteboard!");
    // In real implementation, this would integrate with whiteboard state
  };

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-card/95 backdrop-blur-xl border-l border-border/50 shadow-[var(--shadow-elegant)] z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/30">
        <h3 className="font-semibold text-foreground">Chat</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 h-[calc(100vh-140px)]" ref={scrollAreaRef}>
        <div className="p-4 space-y-4">
          {messages.map((message) => (
            <div 
              key={message.id}
              className={`flex ${message.isOwn ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[85%] space-y-1">
                <div className={`chat-bubble ${message.isOwn ? "own" : ""} group relative`}>
                  <p className="text-sm">{message.text}</p>
                  
                  {/* Add to Whiteboard Button - Formula 6: Insight Amplification */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addToWhiteboard(message)}
                    className="absolute -top-2 -right-2 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Add to whiteboard"
                  >
                    <Pin className="w-3 h-3" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{message.sender}</span>
                  <span>•</span>
                  <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border/30">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-input/50 border-border/50"
          />
          <Button 
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            size="sm"
            className="px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Hover over messages to add them to the whiteboard
        </p>
      </div>
    </div>
  );
};