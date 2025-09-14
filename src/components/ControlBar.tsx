import { Button } from "@/components/ui/button";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MessageSquare, 
  Palette,
  MoreHorizontal,
  PhoneOff,
  Settings,
  Share
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ControlBarProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  activePanel: "none" | "chat" | "whiteboard";
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleChat: () => void;
  onToggleWhiteboard: () => void;
  onLeave: () => void;
}

// Formula 3 & 4: Creative Connection with Dynamic Behavior
export const ControlBar = ({
  isAudioEnabled,
  isVideoEnabled,
  activePanel,
  onToggleAudio,
  onToggleVideo,
  onToggleChat,
  onToggleWhiteboard,
  onLeave
}: ControlBarProps) => {
  return (
    <div className="control-panel flex items-center gap-3 px-6 py-3">
      {/* Core Controls - Always Visible */}
      <Button
        variant={isAudioEnabled ? "secondary" : "destructive"}
        size="lg"
        onClick={onToggleAudio}
        className={`fab ${isAudioEnabled ? "" : "active"}`}
      >
        {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>

      <Button
        variant={isVideoEnabled ? "secondary" : "destructive"}
        size="lg"
        onClick={onToggleVideo}
        className={`fab ${isVideoEnabled ? "" : "active"}`}
      >
        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </Button>

      {/* Collaboration Tools */}
      <div className="w-px h-8 bg-border/50 mx-2" />

      <Button
        variant="secondary"
        size="lg"
        onClick={onToggleChat}
        className={`fab ${activePanel === "chat" ? "active" : ""}`}
      >
        <MessageSquare className="w-5 h-5" />
      </Button>

      <Button
        variant="secondary"
        size="lg"
        onClick={onToggleWhiteboard}
        className={`fab ${activePanel === "whiteboard" ? "active" : ""}`}
      >
        <Palette className="w-5 h-5" />
      </Button>

      {/* More Actions Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="lg" className="fab">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2">
          <DropdownMenuItem>
            <Share className="w-4 h-4 mr-2" />
            Share Screen
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">
            <PhoneOff className="w-4 h-4 mr-2" />
            Audio Only Mode
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Leave Button */}
      <div className="w-px h-8 bg-border/50 mx-2" />
      
      <Button
        variant="destructive"
        size="lg"
        onClick={onLeave}
        className="fab bg-destructive hover:bg-destructive/80"
      >
        <PhoneOff className="w-5 h-5" />
      </Button>
    </div>
  );
};