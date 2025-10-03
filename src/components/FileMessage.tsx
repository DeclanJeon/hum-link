/**
 * @fileoverview    UI   (v2.2.2 - Quantum Handshake Calibrated)
 * @module components/FileMessage
 * @description /     , ETA    .
 *              v2.2.2: 완료 시 평균 속도/시간을 표시하여 UI 멈춤 현상 해결.
 */

import { useChatStore, ChatMessage, FileTransferProgress } from "@/stores/useChatStore";
import { usePeerConnectionStore } from "@/stores/usePeerConnectionStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { File, Download, Upload, X, CheckCircle, AlertCircle, Clock, Pause, Play, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatFileSize, formatSpeed, formatETA } from "@/lib/fileTransferUtils";

interface FileMessageProps {
  message: ChatMessage;
}

type TransferStatus = 'preparing' | 'transferring' | 'verifying' | 'complete' | 'paused' | 'cancelled' | 'error';

export const FileMessage = ({ message }: FileMessageProps) => {
  const transferId = message.id;
  const isSender = message.senderId === useSessionStore.getState().getSessionInfo()?.userId;

  // Zustand       
  const transferProgress = useChatStore(state => state.fileTransfers.get(transferId));
  const activeTransfer = usePeerConnectionStore(state => state.activeTransfers.get(transferId));
  const { pauseFileTransfer, resumeFileTransfer, cancelFileTransfer } = usePeerConnectionStore.getState();

  //   (UI 표시용)
  const [status, setStatus] = useState<TransferStatus>('preparing');

  useEffect(() => {
    if (!transferProgress || !message.fileMeta) return;

    if (transferProgress.isCancelled) {
      setStatus('cancelled');
      return;
    }
    if (transferProgress.isComplete) {
      setStatus('complete');
      return;
    }

    if (isSender) {
      //  
      const metrics = activeTransfer?.metrics;
      if (activeTransfer?.isPaused) {
        setStatus('paused');
      } else if (metrics) {
        // 송신 진행률과 확인된 진행률 차이가 크면 '검증 중'으로 표시
        setStatus(metrics.sendProgress > metrics.progress + 0.05 ? 'verifying' : 'transferring');
      } else {
        setStatus('preparing');
      }
    } else {
      //  
      setStatus('transferring');
    }
  }, [isSender, transferProgress, activeTransfer, message.fileMeta]);

  if (!message.fileMeta || !transferProgress) {
    return (
        <Card className="p-4 bg-secondary/50">
            <div className="flex items-center gap-3"><Loader2 className="w-6 h-6 text-primary animate-spin" /> <p>Loading file info...</p></div>
        </Card>
    );
  }

  const { name, size, totalChunks } = message.fileMeta;
  const { progress, isComplete, blobUrl, isCancelled, speed, eta, averageSpeed, totalTransferTime } = transferProgress;
  const { metrics, isPaused } = activeTransfer || {};

  const getStatusIcon = () => {
    switch (status) {
      case 'preparing': return <Clock className="w-4 h-4 animate-pulse text-yellow-500" />;
      case 'transferring': return isSender ? <Upload className="w-4 h-4 animate-pulse text-blue-500" /> : <Download className="w-4 h-4 animate-pulse text-blue-500" />;
      case 'verifying': return <Loader2 className="w-4 h-4 animate-spin text-purple-500" />;
      case 'paused': return <Pause className="w-4 h-4 text-orange-500" />;
      case 'complete': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'cancelled': return <X className="w-4 h-4 text-destructive" />;
      default: return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'preparing': return 'Preparing...';
      case 'transferring': return isSender ? 'Sending...' : 'Receiving...';
      case 'verifying': return 'Verifying...';
      case 'paused': return 'Paused';
      case 'complete': return 'Complete';
      case 'cancelled': return 'Cancelled';
      default: return 'Error';
    }
  };

  const ackedProgress = (metrics?.progress ?? 0) * 100;
  const sentProgress = (metrics?.sendProgress ?? 0) * 100;
  const receivedProgress = progress * 100;

  const transferredSize = isSender ? (metrics?.ackedSize ?? 0) : (progress * size);

  const finalAverageSpeed = isSender ? (metrics?.averageSpeed ?? 0) : averageSpeed;
  const finalTotalTime = isSender ? (metrics?.totalTransferTime ?? 0) : (totalTransferTime / 1000);

  return (
    <div className="w-full max-w-[85%] space-y-1">
      <Card className="p-4 bg-secondary/50 backdrop-blur-sm border-border/50">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 p-2.5 bg-primary/10 rounded-lg"><File className="w-6 h-6 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(size)}</span><span className="flex items-center gap-1">{getStatusIcon()} {getStatusText()}</span>
            </div>
          </div>
          {isSender && !isComplete && !isCancelled && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => isPaused ? resumeFileTransfer(transferId) : pauseFileTransfer(transferId)}>{isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</Button>
              <Button size="sm" variant="ghost" onClick={() => cancelFileTransfer(transferId)}><X className="w-4 h-4" /></Button>
            </div>
          )}
        </div>

        {!isComplete && !isCancelled && (
          <div className="space-y-3">
            {isSender && metrics && sentProgress > ackedProgress + 1 ? (
              <div className="space-y-1">
                <div className="relative h-2"><Progress value={sentProgress} className="h-2 absolute inset-0 opacity-30" /><Progress value={ackedProgress} className="h-2 absolute inset-0" /></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Confirmed: {ackedProgress.toFixed(0)}%</span><span className="text-muted-foreground/70">Sent: {sentProgress.toFixed(0)}%</span></div>
              </div>
            ) : (
              <div className="space-y-1">
                <Progress value={isSender ? ackedProgress : receivedProgress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground"><span>{formatFileSize(transferredSize)} / {formatFileSize(size)}</span><span>{(isSender ? ackedProgress : receivedProgress).toFixed(0)}%</span></div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className={cn("font-medium", (isSender ? (metrics?.speed ?? 0) : speed) > 0 ? "text-green-400" : "text-muted-foreground")}>
                {formatSpeed(isSender ? (metrics?.speed ?? 0) : speed)}
              </span>
              <span>ETA: {formatETA(isSender ? (metrics?.eta ?? Infinity) : eta)}</span>
              {isSender && metrics && <span>{metrics.chunksAcked}/{totalChunks} chunks</span>}
            </div>
          </div>
        )}

        {isComplete && (
          <>
            <div className="mt-3 space-y-2">
                {blobUrl && !isSender ? (
                <Button asChild size="sm" className="w-full"><a href={blobUrl} download={name}><Download className="w-4 h-4 mr-2" /> Download File</a></Button>
                ) : isSender ? (
                <div className="text-xs text-green-500 flex items-center gap-1 justify-center"><CheckCircle className="w-3 h-3" /> Sent successfully</div>
                ) : null}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>Avg. Speed: {formatSpeed(finalAverageSpeed)}</span>
                <span>Time: {finalTotalTime.toFixed(1)}s</span>
            </div>
          </>
        )}

        {isCancelled && (
            <div className="text-xs text-destructive flex items-center gap-1 justify-center mt-3"><AlertCircle className="w-3 h-3" /> Transfer cancelled</div>
        )}
      </Card>
      <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
        <span>{message.senderNickname}</span><span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
};
