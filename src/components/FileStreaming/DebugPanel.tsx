import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, XCircle, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  // iOS 관련
  isIOS: boolean;
  streamingStrategy: string;
  deviceInfo: string;
}

interface DebugPanelProps {
  debugInfo: DebugInfo;
}

export const DebugPanel = ({ debugInfo }: DebugPanelProps) => {
  const getStatusIcon = (status: boolean) => {
    return status ? 
      <CheckCircle className="w-3 h-3 text-green-500" /> : 
      <XCircle className="w-3 h-3 text-red-500" />;
  };
  
  const getStatusBadge = (label: string, value: any, type: 'success' | 'error' | 'warning' | 'default' = 'default') => {
    return (
      <Badge variant={type === 'success' ? 'default' : type === 'error' ? 'destructive' : 'secondary'} className="text-xs">
        {label}: {value}
      </Badge>
    );
  };
  
  return (
    <Alert className="m-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="space-y-3">
          {/* iOS 정보 */}
          {debugInfo.isIOS && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded">
              <Smartphone className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                iOS Device Detected
              </span>
              <Badge variant="outline" className="text-xs">
                Strategy: {debugInfo.streamingStrategy}
              </Badge>
            </div>
          )}
          
          {/* Stream Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.canvasReady)}
              <span>Canvas Ready</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.streamCreated)}
              <span>Stream Created</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.streamActive)}
              <span>Stream Active</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.audioEnabled)}
              <span>Audio Enabled</span>
            </div>
          </div>
          
          {/* Metrics */}
          <div className="flex flex-wrap gap-2">
            {getStatusBadge('Tracks', debugInfo.trackCount)}
            {getStatusBadge('Peers', debugInfo.peersConnected, 
              debugInfo.peersConnected > 0 ? 'success' : 'warning')}
            {getStatusBadge('FPS', debugInfo.fps, 
              debugInfo.fps > 20 ? 'success' : debugInfo.fps > 10 ? 'warning' : 'error')}
            {getStatusBadge('Drops', debugInfo.frameDrops, 
              debugInfo.frameDrops > 100 ? 'error' : 'default')}
            {debugInfo.isIOS && getStatusBadge('iOS', 'Optimized', 'success')}
          </div>
          
          {/* Video State */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs">Video:</span>
              <Badge variant="outline" className="text-xs">
                {debugInfo.videoState}
              </Badge>
              <span className="text-xs text-muted-foreground">
                @ {debugInfo.videoTime.toFixed(2)}s
              </span>
            </div>
          </div>
          
          {/* Strategy Info */}
          {debugInfo.streamingStrategy && (
            <div className="text-xs">
              <span className="font-semibold">Strategy:</span> {debugInfo.streamingStrategy}
            </div>
          )}
          
          {/* Recent Errors */}
          {debugInfo.errors.length > 0 && (
            <div className="space-y-1">
              <div className="font-semibold text-xs text-red-500">Recent Errors:</div>
              <div className="space-y-0.5">
                {debugInfo.errors.map((err, i) => (
                  <div key={i} className="text-xs text-red-500 font-mono bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded">
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};
