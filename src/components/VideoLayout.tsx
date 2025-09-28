import { useState, useEffect, useMemo } from 'react';
import { VideoPreview } from "@/components/VideoPreview";
import { DraggableVideo } from "@/components/DraggableVideo";
import { VerticalAudioVisualizer } from "@/components/VerticalAudioVisualizer";
import { usePeerConnectionStore } from "@/stores/usePeerConnectionStore";
import { useUIManagementStore } from "@/stores/useUIManagementStore";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useTranscriptionStore } from "@/stores/useTranscriptionStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useFileStreamingStore } from "@/stores/useFileStreamingStore";
import { useSubtitleStore } from "@/stores/useSubtitleStore";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { Loader2, Eye, RotateCw } from "lucide-react";
import { SubtitleOverlay } from './SubtitleOverlay';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

/**
 * 참가자 데이터 타입
 */
interface Participant {
  isLocal: boolean;
  userId: string;
  nickname: string;
  stream: MediaStream | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
  connectionState?: 'connecting' | 'connected' | 'disconnected' | 'failed';
  transcript?: { text: string; isFinal: boolean; lang?: string };
  audioLevel: number;
  isFileStreaming?: boolean;
}

/**
 * 로컬 비디오 타일 컴포넌트
 */
const LocalVideoTile = ({ participant, isMobile }: { participant: Participant; isMobile: boolean }) => {
  const { switchCamera, isMobile: isDeviceMobile, hasMultipleCameras } = useMediaDeviceStore();
  
  return (
    <div className="relative w-full h-full">
      <VideoPreview
        stream={participant.stream}
        nickname={participant.nickname}
        isVideoEnabled={participant.videoEnabled}
        isLocalVideo={true}
        audioLevel={participant.audioLevel}
        showSubtitles={false} // 로컬 비디오는 자막 표시 안함
      />
      
      {/* 모바일 카메라 전환 버튼 */}
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

/**
 * 원격 비디오 타일 컴포넌트
 */
const RemoteVideoTile = ({
  participant,
  showAudioVisualizer
}: {
  participant: Participant;
  showAudioVisualizer: boolean;
}) => {
  const { isRemoteSubtitleEnabled } = useSubtitleStore();
  const { translationTargetLanguage } = useTranscriptionStore();
  const { remoteSubtitleCue } = useSubtitleStore(); // 원격 자막 큐 상태
  
  return (
    <div className="relative w-full h-full">
      <VideoPreview
        stream={participant.stream}
        nickname={participant.nickname}
        isVideoEnabled={participant.videoEnabled}
        isLocalVideo={false}
        audioLevel={participant.audioLevel}
        showSubtitles={false} // VideoPreview 내부 자막 비활성화
        showVoiceFrame={showAudioVisualizer}
      />
      
      {/* 파일 스트리밍 중인 경우 자막 표시 */}
      {participant.isFileStreaming && isRemoteSubtitleEnabled && remoteSubtitleCue && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-fit max-w-[90%] p-2.5 rounded-lg bg-black/60 backdrop-blur-md text-center pointer-events-none z-20">
          <p className="text-lg lg:text-xl font-semibold text-white">
            {remoteSubtitleCue.text}
          </p>
        </div>
      )}
      
      {/* 일반 대화 자막 (음성 인식) */}
      {!participant.isFileStreaming && participant.transcript && (
        <SubtitleOverlay
          transcript={participant.transcript}
          targetLang={translationTargetLanguage}
        />
      )}
      
      {/* 오디오 비주얼라이저 */}
      {showAudioVisualizer && participant.stream && (
        <VerticalAudioVisualizer
          audioLevel={participant.audioLevel}
          isActive={participant.audioEnabled}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30"
          showIcon={true}
        />
      )}
      
      {/* 연결 상태 오버레이 */}
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

/**
 * 메인 VideoLayout 컴포넌트
 */
export const VideoLayout = () => {
  const { viewMode } = useUIManagementStore();
  const { localStream, isVideoEnabled, isAudioEnabled } = useMediaDeviceStore();
  const { peers, updatePeerAudioLevel } = usePeerConnectionStore();
  const { localTranscript, transcriptionLanguage } = useTranscriptionStore();
  const { getSessionInfo } = useSessionStore();
  const { isStreaming: isFileStreaming } = useFileStreamingStore();
  
  const isMobileView = useIsMobile();
  const [showLocalVideo, setShowLocalVideo] = useState(true);
  
  const sessionInfo = getSessionInfo();
  const localNickname = sessionInfo?.nickname || 'You';
  const localUserId = sessionInfo?.userId || 'local';

  // 원격 피어 가져오기
  const remotePeers = useMemo(() => Array.from(peers.values()), [peers]);
  const firstRemotePeer = remotePeers[0] || null;
  
  // 로컬 오디오 레벨
  const localAudioLevel = useAudioLevel({
    stream: localStream,
    enabled: isAudioEnabled,
    updateInterval: 50
  });
  
  // 원격 오디오 레벨
  const remoteAudioLevel = useAudioLevel({
    stream: firstRemotePeer?.stream || null,
    enabled: firstRemotePeer?.audioEnabled || false,
    updateInterval: 50
  });

  // 원격 피어 오디오 레벨 업데이트
  useEffect(() => {
    if (firstRemotePeer && remoteAudioLevel > 0) {
      updatePeerAudioLevel(firstRemotePeer.userId, remoteAudioLevel);
    }
  }, [firstRemotePeer, remoteAudioLevel, updatePeerAudioLevel]);

  // 참가자 목록 생성
 const participants = useMemo<Participant[]>(() => {
   const localParticipant: Participant = {
     isLocal: true,
     userId: localUserId,
     nickname: localNickname,
     stream: localStream,
     videoEnabled: isVideoEnabled,
     audioEnabled: isAudioEnabled,
     transcript: localTranscript ? { ...localTranscript, lang: transcriptionLanguage } : undefined,
     audioLevel: localAudioLevel,
     isFileStreaming: isFileStreaming
   };
    
    const remoteParticipants: Participant[] = remotePeers.map(peer => ({
      isLocal: false,
      userId: peer.userId,
      nickname: peer.nickname,
      stream: peer.stream || null,
      videoEnabled: peer.videoEnabled,
      audioEnabled: peer.audioEnabled,
      connectionState: peer.connectionState,
      transcript: peer.transcript,
      audioLevel: peer.userId === firstRemotePeer?.userId ? remoteAudioLevel : 0,
      isFileStreaming: peer.isStreamingFile || false
    }));
    
    return [localParticipant, ...remoteParticipants];
  }, [
   localUserId, localNickname, localStream, isVideoEnabled, isAudioEnabled,
   localTranscript, transcriptionLanguage, localAudioLevel, isFileStreaming,
   remotePeers, firstRemotePeer, remoteAudioLevel
 ]);

  // 모바일 그리드 뷰
  if (isMobileView && viewMode === 'grid') {
    return (
      <div className="flex flex-col h-full">
        {/* 상단: 원격 비디오 */}
        <div className="flex-1 relative">
          {firstRemotePeer ? (
            <RemoteVideoTile 
              participant={participants.find(p => !p.isLocal) || participants[1]} 
              showAudioVisualizer={!isFileStreaming}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-muted/50 rounded-lg">
              <p className="text-muted-foreground">Waiting for participant...</p>
            </div>
          )}
        </div>

        {/* 하단: 로컬 비디오 */}
        <div className="flex-1 relative">
          <LocalVideoTile 
            participant={participants.find(p => p.isLocal)!} 
            isMobile={true}
          />
        </div>
      </div>
    );
  }

  // 모바일 스피커 뷰
  if (isMobileView && viewMode === 'speaker') {
    return (
      <div className="relative h-full">
        {/* 메인 화면 (원격) */}
        {firstRemotePeer ? (
          <div className="absolute inset-0">
            <RemoteVideoTile 
              participant={participants.find(p => !p.isLocal) || participants[1]} 
              showAudioVisualizer={!isFileStreaming}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
            <p className="text-muted-foreground">Waiting for participant...</p>
          </div>
        )}

        {/* 드래그 가능한 로컬 비디오 */}
        {showLocalVideo ? (
          <DraggableVideo
            stream={localStream}
            nickname={localNickname}
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

  // 데스크톱 그리드 뷰
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
                showAudioVisualizer={!isFileStreaming}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // 데스크톱 스피커 뷰
  return (
    <>
      {firstRemotePeer ? (
        <div className="absolute inset-4">
          <RemoteVideoTile 
            participant={participants.find(p => !p.isLocal) || participants[1]} 
            showAudioVisualizer={!isFileStreaming}
          />
        </div>
      ) : (
        <div className="absolute inset-4 flex items-center justify-center bg-muted/50 rounded-lg">
          <p className="text-muted-foreground">Waiting for another participant to join...</p>
        </div>
      )}
      
      <div className="absolute bottom-24 right-6 w-48 lg:w-64 aspect-video z-20">
        <LocalVideoTile 
          participant={participants.find(p => p.isLocal)!} 
          isMobile={false}
        />
      </div>
    </>
  );
};