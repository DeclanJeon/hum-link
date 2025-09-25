import { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Maximize2, Minimize2 } from 'lucide-react';

interface RemoteStreamViewerProps {
  stream: MediaStream;
  peerId: string;
  peerNickname: string;
  onClose: () => void;
}

export const RemoteStreamViewer = ({ 
  stream, 
  peerId, 
  peerNickname, 
  onClose 
}: RemoteStreamViewerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Card className="fixed bottom-24 left-6 w-96 z-30 overflow-hidden">
      <div className="flex items-center justify-between p-2 bg-secondary">
        <span className="text-sm font-medium">
          {peerNickname} is sharing
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-auto"
      />
    </Card>
  );
};