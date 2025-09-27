import { Button } from '@/components/ui/button';
import { Play, StopCircle, Camera } from 'lucide-react';

interface StreamControlsProps {
  isStreaming: boolean;
  selectedFile: File | null;
  peers: Map<string, any>;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
  onReturnToCamera: () => void;
}

export const StreamControls = ({
  isStreaming,
  selectedFile,
  peers,
  onStartStreaming,
  onStopStreaming,
  onReturnToCamera
}: StreamControlsProps) => {
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
            >
              <Camera className="w-4 h-4" />
              Return to Camera
            </Button>
          </>
        )}
      </div>
      
      {/* Status */}
      <div className="flex items-center gap-4 text-sm">
        {isStreaming && (
          <span className="text-green-500 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Streaming to {peers.size} peer(s)
          </span>
        )}
      </div>
    </div>
  );
};
