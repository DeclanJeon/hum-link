import { useState, useEffect, useMemo } from 'react';
import { VideoPreview } from "@/components/VideoPreview";
import { DraggableVideo } from "@/components/DraggableVideo";
import { useUIManagementStore } from "@/stores/useUIManagementStore";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useTranscriptionStore } from "@/stores/useTranscriptionStore";
import { useSubtitleStore } from "@/stores/useSubtitleStore";
import { Loader2, Eye, RotateCw } from "lucide-react";
import { SubtitleOverlay } from './SubtitleOverlay';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from './ui/button';
import { useParticipants, Participant } from '@/hooks/useParticipants';

const LocalVideoTile = ({ participant, isMobile }: { participant: Participant; isMobile: boolean }) => {
  const { switchCamera, isMobile: isDeviceMobile, hasMultipleCameras } = useMediaDeviceStore();
  
  return (
    <div className="relative w-full h-full">
      <VideoPreview
        stream={participant.stream}
        nickname={participant.nickname}
        isVideoEnabled={participant.videoEnabled}
        isLocalVideo={true}
        audioLevel={0}
        showSubtitles={false}
      />
      
      {isMobile && isDeviceMobile && hasMultipleCameras && (
        <Button
          variant="ghost"
          size="sm"
          onClick={switchCamera}
          className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm p-0"
        >
          <RotateCw className="w-5 h-5 text-white" />
        </Button>
      )}
    </div>
  );
};

const RemoteVideoTile = ({
  participant,
  showAudioVisualizer
}: {
  participant: Participant;
  showAudioVisualizer: boolean;
}) => {
  const { isRemoteSubtitleEnabled } = useSubtitleStore();
  const { translationTargetLanguage } = useTranscriptionStore();
  const { remoteSubtitleCue } = useSubtitleStore();
  
  return (
    <div className="relative w-full h-full">
      <VideoPreview
        stream={participant.stream}
        nickname={participant.nickname}
        isVideoEnabled={participant.videoEnabled}
        isLocalVideo={false}
        audioLevel={0}
        showSubtitles={false}
        showVoiceFrame={false}
      />
      
      {participant.isStreamingFile && isRemoteSubtitleEnabled && remoteSubtitleCue && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-fit max-w-[90%] p-2.5 rounded-lg bg-black/60 backdrop-blur-md text-center pointer-events-none z-20">
          <p className="text-lg lg:text-xl font-semibold text-white">
            {remoteSubtitleCue.text}
          </p>
        </div>
      )}
      
      {!participant.isStreamingFile && participant.transcript && (
        <SubtitleOverlay
          transcript={participant.transcript}
          targetLang={translationTargetLanguage}
        />
      )}
      
      {participant.connectionState === 'connecting' && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-lg gap-4">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="text-white text-lg font-medium">Connecting to {participant.nickname}...</p>
        </div>
      )}
      
      {(participant.connectionState === 'disconnected' || participant.connectionState === 'failed') && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
          <p className="text-white text-lg font-medium">Connection to {participant.nickname} lost.</p>
        </div>
      )}
    </div>
  );
};

export const VideoLayout = () => {
  const { viewMode } = useUIManagementStore();
  const participants = useParticipants();
  const { localStream, isVideoEnabled } = useMediaDeviceStore();
  const localParticipant = participants.find(p => p.isLocal);
  const remoteParticipants = participants.filter(p => !p.isLocal);
  
  const isMobileView = useIsMobile();
  const [showLocalVideo, setShowLocalVideo] = useState(true);

  if (!localParticipant) return null;

  if (isMobileView && viewMode === 'grid') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 relative">
          {remoteParticipants.length > 0 ? (
            <RemoteVideoTile 
              participant={remoteParticipants[0]} 
              showAudioVisualizer={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-muted/50 rounded-lg">
              <p className="text-muted-foreground">Waiting for participant...</p>
            </div>
          )}
        </div>
        <div className="flex-1 relative">
          <LocalVideoTile 
            participant={localParticipant} 
            isMobile={true}
          />
        </div>
      </div>
    );
  }

  if (isMobileView && viewMode === 'speaker') {
    return (
      <div className="relative h-full">
        {remoteParticipants.length > 0 ? (
          <div className="absolute inset-0">
            <RemoteVideoTile 
              participant={remoteParticipants[0]} 
              showAudioVisualizer={false}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
            <p className="text-muted-foreground">Waiting for participant...</p>
          </div>
        )}
        {showLocalVideo ? (
          <DraggableVideo
            stream={localStream}
            nickname={localParticipant.nickname}
            isVideoEnabled={isVideoEnabled}
            isLocalVideo={true}
            onHide={() => setShowLocalVideo(false)}
          />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLocalVideo(true)}
            className="fixed bottom-20 right-4 z-40"
          >
            <Eye className="w-4 h-4 mr-2" />
            Show my video
          </Button>
        )}
      </div>
    );
  }

  if (viewMode === 'grid') {
    const gridClass = participants.length <= 2 ? 'grid-cols-2' : 
                     participants.length <= 4 ? 'grid-cols-2' : 
                     participants.length <= 6 ? 'grid-cols-3' : 'grid-cols-4';

    return (
      <div className={`grid ${gridClass} gap-4 w-full h-full p-4`}>
        {participants.map(participant => (
          <div key={participant.userId} className="w-full h-full relative">
            {participant.isLocal ? (
              <LocalVideoTile participant={participant} isMobile={false} />
            ) : (
              <RemoteVideoTile 
                participant={participant} 
                showAudioVisualizer={false}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {remoteParticipants.length > 0 ? (
        <div className="absolute inset-4">
          <RemoteVideoTile 
            participant={remoteParticipants[0]} 
            showAudioVisualizer={false}
          />
        </div>
      ) : (
        <div className="absolute inset-4 flex items-center justify-center bg-muted/50 rounded-lg">
          <p className="text-muted-foreground">Waiting for another participant to join...</p>
        </div>
      )}
      
      <div className="absolute bottom-24 right-6 w-48 lg:w-64 aspect-video z-20">
        <LocalVideoTile 
          participant={localParticipant} 
          isMobile={false}
        />
      </div>
    </>
  );
};
