import { useWebRTCStore } from "@/stores/useWebRTCStore";
import { WifiOff } from "lucide-react";

export const GlobalConnectionStatus = () => {
  const signalingStatus = useWebRTCStore((state) => state.signalingStatus);

  if (signalingStatus === 'connected') {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-destructive text-destructive-foreground p-2 text-center text-sm flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      {signalingStatus === 'connecting' 
        ? 'Connecting to server...' 
        : 'Connection to server lost. Attempting to reconnect...'}
    </div>
  );
};
