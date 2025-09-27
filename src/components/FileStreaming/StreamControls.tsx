// src/components/FileStreaming/StreamControls.tsx
import { Button } from '@/components/ui/button';
import { Play, StopCircle, Camera, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StreamControlsProps {
  isStreaming: boolean;
  selectedFile: File | null;
  peers: Map<string, any>;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
  onReturnToCamera: () => void;
  isReturningToCamera?: boolean;
}

export const StreamControls = ({
  isStreaming,
  selectedFile,
  peers,
  onStartStreaming,
  onStopStreaming,
  onReturnToCamera,
  isReturningToCamera = false
}: StreamControlsProps) => {
  const connectedPeers = Array.from(peers.values()).filter(
    peer => peer?.connected && !peer?.destroyed
  ).length;
  
  return (
    <div className="flex items-center justify-between pt-4 border-t">
      <div className="flex gap-2">
        {!isStreaming ? (
          <Button
            onClick={onStartStreaming}
            disabled={!selectedFile}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Streaming
          </Button>
        ) : (
          <>
            <Button
              onClick={onStopStreaming}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <StopCircle className="w-4 h-4" />
              Stop Streaming
            </Button>
            <Button
              onClick={onReturnToCamera}
              variant="outline"
              className="flex items-center gap-2"
              disabled={isReturningToCamera}
            >
              {isReturningToCamera ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Returning...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  Return to Camera
                </>
              )}
            </Button>
          </>
        )}
      </div>
      
      {/* Status Indicators */}
      <div className="flex items-center gap-3">
        {/* File Status */}
        {selectedFile && (
          <Badge variant="outline" className="text-xs">
            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
          </Badge>
        )}
        
        {/* Connection Status */}
        {isStreaming && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-500 font-medium">
                Streaming
              </span>
            </div>
            <Badge variant={connectedPeers > 0 ? "default" : "secondary"}>
              {connectedPeers} peer{connectedPeers !== 1 ? 's' : ''}
            </Badge>
          </div>
        )}
        
        {/* No peers warning */}
        {isStreaming && connectedPeers === 0 && (
          <Badge variant="destructive" className="text-xs">
            No viewers connected
          </Badge>
        )}
      </div>
    </div>
  );
};
