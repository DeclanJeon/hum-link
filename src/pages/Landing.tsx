import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Formula 1: Genius Insight - Maximum simplicity for connection focus
const Landing = () => {
  const navigate = useNavigate();
  const [roomTitle, setRoomTitle] = useState("");
  const [nickname, setNickname] = useState("");

  const generateRandomNickname = () => {
    const adjectives = ["Brilliant", "Curious", "Radiant", "Wandering", "Inspiring", "Creative", "Thoughtful", "Dynamic"];
    const nouns = ["Explorer", "Innovator", "Dreamer", "Architect", "Visionary", "Creator", "Pioneer", "Builder"];
    
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${randomAdjective} ${randomNoun}`;
  };

  const handleConnect = () => {
    if (!roomTitle.trim()) {
      toast.error("Please enter a room title to continue");
      return;
    }

    const finalNickname = nickname.trim() || generateRandomNickname();
    
    // Store connection details for the lobby
    sessionStorage.setItem("connectionDetails", JSON.stringify({
      roomTitle: roomTitle.trim(),
      nickname: finalNickname
    }));

    toast.success(`Connecting as "${finalNickname}"...`);
    navigate("/lobby");
  };

  const handleNicknameGenerate = () => {
    const randomName = generateRandomNickname();
    setNickname(randomName);
    toast("✨ Perfect! This name suits you", { duration: 2000 });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Ethereal Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-breathing" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-breathing" style={{ animationDelay: "2s" }} />

      {/* Main Content - Formula 1: Extreme Simplicity */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 text-gradient animate-breathing">
            Singularity
          </h1>
          <p className="text-muted-foreground text-lg">
            Where conversations become connections
          </p>
        </div>

        <div className="space-y-6">
          {/* Room Title - Primary Focus */}
          <div className="space-y-2">
            <Label htmlFor="roomTitle" className="text-foreground font-medium">
              Room Title
            </Label>
            <Input
              id="roomTitle"
              placeholder="Enter your meeting room name..."
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
              className="h-12 text-lg bg-input/50 backdrop-blur-sm border-border/50 focus:border-primary/50 focus:ring-primary/20"
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>

          {/* Nickname - Optional with Smart Generation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nickname" className="text-foreground font-medium">
                Nickname <span className="text-muted-foreground text-sm">(optional)</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNicknameGenerate}
                className="text-primary hover:text-primary-glow text-sm"
              >
                ✨ Inspire me
              </Button>
            </div>
            <Input
              id="nickname"
              placeholder="Leave empty for a surprise..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="h-12 text-lg bg-input/50 backdrop-blur-sm border-border/50 focus:border-primary/50 focus:ring-primary/20"
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>

          {/* Connection Button - The Only Action */}
          <Button
            onClick={handleConnect}
            className="w-full h-14 text-lg btn-connection mt-8"
            disabled={!roomTitle.trim()}
          >
            Connect
          </Button>
        </div>

        {/* Subtle Branding */}
        <div className="text-center mt-12 text-muted-foreground text-sm">
          Experience design that disappears into pure connection
        </div>
      </div>
    </div>
  );
};

export default Landing;