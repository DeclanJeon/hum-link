import { useEffect, useState } from "react";

interface VoiceVisualizerProps {
  audioLevel: number;
  isActive: boolean;
  size?: "small" | "medium" | "large";
  position?: "frame" | "standalone";
}

// Formula 9: Intuitive Leap - Voice visualization as emotional connection
export const VoiceVisualizer = ({ 
  audioLevel, 
  isActive, 
  size = "medium",
  position = "standalone" 
}: VoiceVisualizerProps) => {
  const [ripples, setRipples] = useState<number[]>([]);

  useEffect(() => {
    if (isActive && audioLevel > 0.1) {
      // Create ripple effect on voice activity
      const newRipple = Date.now();
      setRipples(prev => [...prev, newRipple]);

      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(id => id !== newRipple));
      }, 1000);
    }
  }, [audioLevel, isActive]);

  const getSizeClasses = () => {
    switch (size) {
      case "small":
        return "w-16 h-16";
      case "large":
        return "w-32 h-32";
      default:
        return "w-24 h-24";
    }
  };

  const getFrameClasses = () => {
    return position === "frame" 
      ? "absolute inset-0 rounded-lg" 
      : `${getSizeClasses()} rounded-full mx-auto relative`;
  };

  const intensity = isActive ? Math.min(audioLevel * 2, 1) : 0;

  return (
    <div className={getFrameClasses()}>
      {/* Base circle/frame */}
      <div 
        className={`absolute inset-0 ${position === "frame" ? "rounded-lg" : "rounded-full"} transition-all duration-200`}
        style={{
          background: position === "frame" 
            ? `linear-gradient(45deg, 
                hsl(var(--primary) / ${intensity * 0.2}), 
                hsl(var(--accent) / ${intensity * 0.1}))`
            : `radial-gradient(circle, 
                hsl(var(--primary) / ${intensity * 0.6}), 
                hsl(var(--primary-glow) / ${intensity * 0.3}), 
                transparent 70%)`,
          transform: `scale(${1 + intensity * 0.1})`,
          boxShadow: isActive && intensity > 0.2 
            ? `0 0 ${20 + intensity * 30}px hsl(var(--primary) / ${intensity * 0.4})`
            : "none"
        }}
      />

      {/* Ripple effects */}
      {ripples.map((rippleId) => (
        <div
          key={rippleId}
          className={`absolute inset-0 ${position === "frame" ? "rounded-lg" : "rounded-full"} animate-voice-ripple pointer-events-none`}
          style={{
            background: position === "frame" 
              ? "none"
              : `radial-gradient(circle, transparent 40%, hsl(var(--primary) / 0.3) 50%, transparent 70%)`,
            border: position === "frame" 
              ? `2px solid hsl(var(--primary) / 0.4)`
              : "none"
          }}
        />
      ))}

      {/* Center indicator for standalone mode */}
      {position === "standalone" && (
        <div className="absolute inset-4 rounded-full bg-primary/20 flex items-center justify-center">
          <div 
            className="w-4 h-4 rounded-full bg-primary transition-transform duration-100"
            style={{ transform: `scale(${0.8 + intensity * 0.4})` }}
          />
        </div>
      )}

      {/* Activity text for large standalone visualizers */}
      {position === "standalone" && size === "large" && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center">
          <p className="text-sm text-muted-foreground">
            {isActive ? (intensity > 0.1 ? "Speaking..." : "Listening") : "Muted"}
          </p>
        </div>
      )}
    </div>
  );
};