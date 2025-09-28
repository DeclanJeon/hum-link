import { useChatStore, ChatMessage } from "@/stores/useChatStore";
import { usePeerConnectionStore } from "@/stores/usePeerConnectionStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { File, Download, Upload, X, CheckCircle, AlertCircle, Clock, Pause, Play } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface FileMessageProps {
  message: ChatMessage;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatFileSize(bytesPerSecond)}/s`;
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};

type TransferStatus = 'preparing' | 'transferring' | 'verifying' | 'complete' | 'error' | 'paused';

export const FileMessage = ({ message }: FileMessageProps) => {
  const { fileTransfers } = useChatStore();
  
  // Selector를 사용하여 필요한 부분만 구독
  const activeTransfers = usePeerConnectionStore(state => state.activeTransfers);
  const pauseFileTransfer = usePeerConnectionStore(state => state.pauseFileTransfer);
  const resumeFileTransfer = usePeerConnectionStore(state => state.resumeFileTransfer);
  const cancelFileTransfer = usePeerConnectionStore(state => state.cancelFileTransfer);
  
  // 현재 전송 상태 가져오기
  const activeTransfer = activeTransfers.get(message.id);
  const transferInfo = fileTransfers.get(message.id);
  
  const sessionInfo = useSessionStore.getState().getSessionInfo();
  const isLocalFile = message.senderId === sessionInfo?.userId;

  // 상태 관리
  const [status, setStatus] = useState<TransferStatus>('preparing');
  const [primaryProgress, setPrimaryProgress] = useState(0);
  const [secondaryProgress, setSecondaryProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [transferredSize, setTransferredSize] = useState(0);
  
  // 상태 업데이트 로직
  useEffect(() => {
    if (!message.fileMeta || !transferInfo) return;
    
    if (isLocalFile && activeTransfer) {
      // === 송신 측 로직 ===
      const metrics = activeTransfer.metrics;
      
      // 실제 진행률 계산
      const actualProgress = metrics.progress || 0;
      const sentProgress = metrics.sendProgress || 0;
      
      // UI 업데이트
      setPrimaryProgress(actualProgress * 100);
      setSecondaryProgress(sentProgress * 100);
      
      // 상태 결정
      if (activeTransfer.isPaused) {
        setStatus('paused');
      } else if (transferInfo.isComplete || actualProgress >= 0.99) {
        setStatus('complete');
      } else if (actualProgress > 0.01) {
        setStatus('transferring');
      } else if (sentProgress > actualProgress + 0.1) {
        setStatus('verifying');
      } else {
        setStatus('preparing');
      }
      
      // 속도 및 ETA 계산
      setSpeed(metrics.speed || 0);
      setTransferredSize(actualProgress * message.fileMeta.size);
      
      if (metrics.speed > 0 && actualProgress < 1) {
        const remaining = message.fileMeta.size * (1 - actualProgress);
        setEta(remaining / metrics.speed);
      } else {
        setEta(null);
      }
      
    } else if (!isLocalFile && transferInfo) {
      // === 수신 측 로직 ===
      const receivedProgress = transferInfo.progress * 100;
      
      setPrimaryProgress(receivedProgress);
      setSecondaryProgress(receivedProgress);
      
      if (transferInfo.isComplete) {
        setStatus('complete');
      } else if (receivedProgress < 5) {
        setStatus('preparing');
      } else {
        setStatus('transferring');
      }
      
      setTransferredSize(message.fileMeta.size * transferInfo.progress);
      
      // 수신 속도 계산
      const chunks = transferInfo.receivedChunks?.size || 0;
      const elapsed = (Date.now() - message.timestamp) / 1000;
      if (elapsed > 0 && chunks > 0) {
        const bytesReceived = chunks * (message.fileMeta.chunkSize || 65536);
        const currentSpeed = bytesReceived / elapsed;
        setSpeed(currentSpeed);
        
        if (currentSpeed > 0 && transferInfo.progress < 1) {
          const remaining = message.fileMeta.size * (1 - transferInfo.progress);
          setEta(remaining / currentSpeed);
        }
      }
    } else if (transferInfo?.isComplete) {
      setStatus('complete');
      setPrimaryProgress(100);
      setSecondaryProgress(100);
    }
    
  }, [
    message,
    transferInfo,
    activeTransfer?.metrics,
    activeTransfer?.metrics?.progress,
    activeTransfer?.metrics?.sendProgress,
    activeTransfer?.metrics?.lastUpdateTime,
    activeTransfer?.isPaused,
    isLocalFile
  ]);

  if (!message.fileMeta || !transferInfo) return null;

  const { name, size } = message.fileMeta;
  const { isComplete, blobUrl } = transferInfo;

  // 상태별 색상
  const getStatusColor = () => {
    switch (status) {
      case 'preparing': return 'text-yellow-500';
      case 'transferring': return 'text-blue-500';
      case 'verifying': return 'text-purple-500';
      case 'complete': return 'text-green-500';
      case 'paused': return 'text-orange-500';
      case 'error': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'preparing': return <Clock className="w-4 h-4 animate-pulse" />;
      case 'transferring': return isLocalFile ? 
        <Upload className="w-4 h-4 animate-pulse" /> : 
        <Download className="w-4 h-4 animate-pulse" />;
      case 'verifying': return <AlertCircle className="w-4 h-4 animate-spin" />;
      case 'complete': return <CheckCircle className="w-4 h-4" />;
      case 'paused': return <Pause className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'preparing': return 'Preparing...';
      case 'transferring': return isLocalFile ? 'Uploading' : 'Downloading';
      case 'verifying': return 'Verifying...';
      case 'complete': return 'Complete';
      case 'paused': return 'Paused';
      case 'error': return 'Failed';
    }
  };

  const handlePauseResume = () => {
    if (activeTransfer?.isPaused) {
      resumeFileTransfer(message.id);
    } else {
      pauseFileTransfer(message.id);
    }
  };

  return (
    <div className="w-full max-w-[85%] space-y-1">
      <Card className="p-4 bg-secondary/50 backdrop-blur-sm border-border/50">
        {/* 파일 정보 헤더 */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 p-2.5 bg-primary/10 rounded-lg">
            <File className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(size)}</span>
              <span>•</span>
              <div className={cn("flex items-center gap-1", getStatusColor())}>
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </div>
            </div>
          </div>
          
          {/* 컨트롤 버튼 */}
          {isLocalFile && !isComplete && (
            <div className="flex gap-1">
              {activeTransfer && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePauseResume}
                  disabled={status === 'preparing'}
                >
                  {activeTransfer.isPaused ? 
                    <Play className="w-4 h-4" /> : 
                    <Pause className="w-4 h-4" />
                  }
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => cancelFileTransfer(message.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        
        {/* 진행 상태 */}
        {!isComplete && (
          <div className="space-y-3">
            {/* 프로그레스 바 */}
            {isLocalFile && secondaryProgress > primaryProgress + 5 ? (
              // 송신측: 이중 프로그레스
              <div className="space-y-1">
                <div className="relative">
                  <Progress 
                    value={secondaryProgress} 
                    className="h-2 opacity-30"
                  />
                  <Progress 
                    value={primaryProgress} 
                    className="h-2 absolute inset-0"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Confirmed: {primaryProgress.toFixed(0)}%</span>
                  <span className="text-muted-foreground/50">Sent: {secondaryProgress.toFixed(0)}%</span>
                </div>
              </div>
            ) : (
              // 일반 프로그레스
              <div className="space-y-1">
                <Progress value={primaryProgress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatFileSize(transferredSize)} / {formatFileSize(size)}</span>
                  <span>{primaryProgress.toFixed(0)}%</span>
                </div>
              </div>
            )}
            
            {/* 전송 통계 */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 text-muted-foreground">
                {speed > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    {formatSpeed(speed)}
                  </span>
                )}
                {eta !== null && eta > 0 && (
                  <span>ETA: {formatTime(eta)}</span>
                )}
              </div>
              
              {/* 청크 정보 (송신측) */}
              {isLocalFile && activeTransfer?.metrics && (
                <div className="text-muted-foreground/70">
                  {activeTransfer.metrics.chunksAcked}/{activeTransfer.metrics.totalChunks} chunks
                </div>
              )}
            </div>

            {/* 상태 메시지 */}
            {status === 'verifying' && (
              <div className="text-xs text-purple-500 animate-pulse text-center">
                Waiting for confirmation...
              </div>
            )}
            
            {status === 'preparing' && (
              <div className="text-xs text-yellow-500 animate-pulse text-center">
                Establishing connection...
              </div>
            )}
            
            {status === 'paused' && (
              <div className="text-xs text-orange-500 text-center">
                Transfer paused - Click play to resume
              </div>
            )}
          </div>
        )}
        
        {/* 완료 상태 */}
        {isComplete && (
          <div className="mt-3 space-y-2">
            {blobUrl && (
              <Button asChild size="sm" className="w-full">
                <a href={blobUrl} download={name}>
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </a>
              </Button>
            )}
            
            <div className="text-xs text-green-500 flex items-center gap-1 justify-center">
              <CheckCircle className="w-3 h-3" />
              Transfer complete
            </div>
          </div>
        )}
      </Card>
      
      {/* 메시지 메타데이터 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
        <span>{message.senderNickname}</span>
        <span>•</span>
        <span>{new Date(message.timestamp).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}</span>
      </div>
    </div>
  );
};
