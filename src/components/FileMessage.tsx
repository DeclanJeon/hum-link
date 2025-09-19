import { useChatStore, ChatMessage } from "@/stores/useChatStore";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { File, Download, Loader2 } from "lucide-react";

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

export const FileMessage = ({ message }: FileMessageProps) => {
  const { fileTransfers } = useChatStore();
  const transferInfo = fileTransfers.get(message.id);

  if (!message.fileMeta || !transferInfo) return null;

  const { name, size } = message.fileMeta;
  const { progress, isComplete, isReceiving, blobUrl } = transferInfo;

  return (
    <div className="w-full max-w-[85%] space-y-1">
        <div className="p-3 rounded-lg bg-secondary/80 backdrop-blur-sm border border-border/30">
            <div className="flex items-center gap-3">
                <div className="flex-shrink-0 p-2 bg-primary/10 rounded-md">
                    <File className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(size)}</p>
                </div>
            </div>
            {!isComplete && (
                <div className="mt-2 flex items-center gap-2">
                    <Progress value={progress * 100} className="h-2" />
                    <span className="text-xs font-mono text-muted-foreground">{Math.round(progress * 100)}%</span>
                </div>
            )}
            {isReceiving && !isComplete && (
                 <div className="mt-2 text-xs text-primary flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Receiving...
                </div>
            )}
            {isComplete && blobUrl && (
                <Button asChild size="sm" className="mt-2 w-full">
                    <a href={blobUrl} download={name}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </a>
                </Button>
            )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{message.senderNickname}</span>
            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    </div>
  );
};