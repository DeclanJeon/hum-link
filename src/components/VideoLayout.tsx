import { VideoPreview } from "@/components/VideoPreview";
import { usePeerConnectionStore } from "@/stores/usePeerConnectionStore";
import { useUIManagementStore } from "@/stores/useUIManagementStore";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useTranscriptionStore } from "@/stores/useTranscriptionStore";
import { Loader2 } from "lucide-react";
import { SubtitleOverlay } from './SubtitleOverlay';

export const VideoLayout = () => {
  // --- 스토어에서 직접 상태 가져오기 ---
  const { viewMode } = useUIManagementStore();
  const { localStream, isVideoEnabled } = useMediaDeviceStore();
  const { peers } = usePeerConnectionStore();
  const { localTranscript, transcriptionLanguage, translationTargetLanguage } = useTranscriptionStore();
  
  const localNickname = 'You'; 

  const allParticipants = [
    {
      isLocal: true,
      userId: 'local',
      nickname: localNickname,
      stream: localStream,
      videoEnabled: isVideoEnabled,
      connectionState: 'connected' as const,
      transcript: localTranscript
    },
    ...Array.from(peers.values()).map(p => ({ ...p, isLocal: false }))
  ];

  if (viewMode === 'grid') {
    const total = allParticipants.length;
    const getGridClass = (count: number) => {
      if (count <= 1) return 'grid-cols-1';
      if (count <= 2) return 'grid-cols-2';
      if (count <= 4) return 'grid-cols-2';
      if (count <= 6) return 'grid-cols-3';
      if (count <= 9) return 'grid-cols-3';
      return 'grid-cols-4';
    };
    const gridClass = getGridClass(total);

    return (
      <div className={`grid ${gridClass} gap-4 w-full h-full p-4`}>
        {allParticipants.map(p => (
          <div key={p.userId} className="w-full h-full relative">
            <VideoPreview
              stream={p.stream || null}
              nickname={p.nickname}
              isVideoEnabled={p.videoEnabled}
              isLocalVideo={p.isLocal}
            />
            <SubtitleOverlay
              transcript={p.transcript ? { ...p.transcript, lang: (p.transcript as any).lang || 'en-US' } : undefined}
              targetLang={p.isLocal ? "none" : translationTargetLanguage}
            />
          </div>
        ))}
      </div>
    );
  }

  const remotePeer = peers.size > 0 ? Array.from(peers.values())[0] : null;

  return (
    <>
      {remotePeer ? (
        <div className="absolute inset-4">
          <VideoPreview
            stream={remotePeer.stream || null}
            nickname={remotePeer.nickname}
            isVideoEnabled={remotePeer.videoEnabled}
          />
          <SubtitleOverlay
            transcript={remotePeer.transcript}
            targetLang={translationTargetLanguage}
          />
          {(() => {
            if (remotePeer.connectionState === 'connecting') {
              return (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-lg gap-4">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="text-white text-lg font-medium">Connecting to {remotePeer.nickname}...</p>
                </div>
              );
            } else if (remotePeer.connectionState === 'disconnected' || remotePeer.connectionState === 'failed') {
              return (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                  <p className="text-white text-lg font-medium">Connection to {remotePeer.nickname} lost.</p>
                </div>
              );
            }
            return null;
          })()}
        </div>
      ) : (
        <div className="absolute inset-4 flex items-center justify-center bg-muted/50 rounded-lg">
          <p className="text-muted-foreground">Waiting for another participant to join...</p>
        </div>
      )}
      <div className="absolute bottom-24 right-6 w-48 lg:w-64 aspect-video z-20">
        <VideoPreview
          stream={localStream}
          nickname={localNickname}
          isVideoEnabled={isVideoEnabled}
          isLocalVideo={true}
        />
        <SubtitleOverlay
          transcript={{ ...localTranscript, lang: transcriptionLanguage }}
          targetLang="none"
        />
      </div>
    </>
  );
};