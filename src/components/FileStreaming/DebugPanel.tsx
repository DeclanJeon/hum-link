import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface DebugInfo {
  canvasReady: boolean;
  streamCreated: boolean;
  streamActive: boolean;
  trackCount: number;
  peersConnected: number;
  videoState: string;
  videoTime: number;
  fps: number;
  frameDrops: number;
  audioEnabled: boolean;
  errors: string[];
}

interface DebugPanelProps {
  debugInfo: DebugInfo;
}

export const DebugPanel = ({ debugInfo }: DebugPanelProps) => {
  return (
    <Alert className="m-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="space-y-1 text-xs font-mono">
          <div>Canvas Ready: {debugInfo.canvasReady ? '✅' : '❌'}</div>
          <div>Stream Created: {debugInfo.streamCreated ? '✅' : '❌'}</div>
          <div>Stream Active: {debugInfo.streamActive ? '✅' : '❌'}</div>
          <div>Track Count: {debugInfo.trackCount}</div>
          <div>Audio Enabled: {debugInfo.audioEnabled ? '✅' : '❌'}</div>
          <div>Peers Connected: {debugInfo.peersConnected}</div>
          <div>Video State: {debugInfo.videoState}</div>
          <div>Current FPS: {debugInfo.fps}</div>
          <div>Frame Drops: {debugInfo.frameDrops}</div>
          <div>Video Time: {debugInfo.videoTime.toFixed(2)}s</div>
          {debugInfo.errors.length > 0 && (
            <div className="mt-2">
              <div className="font-bold">Recent Errors:</div>
              {debugInfo.errors.map((err, i) => (
                <div key={i} className="text-red-500">{err}</div>
              ))}
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};
