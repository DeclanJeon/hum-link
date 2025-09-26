import { useState, useEffect } from 'react';
import { VideoPreview } from "@/components/VideoPreview";
import { DraggableVideo } from "@/components/DraggableVideo";
import { VerticalAudioVisualizer } from "@/components/VerticalAudioVisualizer";
import { usePeerConnectionStore } from "@/stores/usePeerConnectionStore";
import { useUIManagementStore } from "@/stores/useUIManagementStore";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useTranscriptionStore } from "@/stores/useTranscriptionStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useFileStreamingStore } from "@/stores/useFileStreamingStore";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { Loader2, Eye, RotateCw } from "lucide-react";
import { SubtitleOverlay } from './SubtitleOverlay';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

export const VideoLayout = () => {
  const { viewMode } = useUIManagementStore();
  const { localStream, isVideoEnabled, isAudioEnabled, switchCamera, isMobile: isDeviceMobile, hasMultipleCameras } = useMediaDeviceStore();
  const { peers, updatePeerAudioLevel } = usePeerConnectionStore();
  const { localTranscript, translationTargetLanguage } = useTranscriptionStore();
  const { getSessionInfo } = useSessionStore();
  const { isStreaming: isFileStreaming } = useFileStreamingStore();
  
  const isMobileView = useIsMobile();
  const [showLocalVideo, setShowLocalVideo] = useState(true);
  
  const sessionInfo = getSessionInfo();
  const localNickname = sessionInfo?.nickname || 'You';
  const localUserId = sessionInfo?.userId || 'local';

  // 원격 피어 가져오기
  const remotePeer = peers.size > 0 ? Array.from(peers.values())[0] : null;
  
  // 원격 피어의 오디오 레벨 추적
  const remoteAudioLevel = useAudioLevel({
    stream: remotePeer?.stream || null,
    enabled: remotePeer?.audioEnabled || false,
    updateInterval: 50 // 더 빠른 업데이트
  });

  // 로컬 오디오 레벨 추적 (필요한 경우)
  const localAudioLevel = useAudioLevel({
    stream: localStream,
    enabled: true,
    updateInterval: 50
  });

  // 원격 피어 오디오 레벨 업데이트
  useEffect(() => {
    if (remotePeer && remoteAudioLevel > 0) {
      updatePeerAudioLevel(remotePeer.userId, remoteAudioLevel);
    }
  }, [remotePeer, remoteAudioLevel, updatePeerAudioLevel]);

  const allParticipants = [
    {
      isLocal: true,
      userId: localUserId,
      nickname: localNickname,
      stream: localStream,
      videoEnabled: isVideoEnabled,
      audioEnabled: isAudioEnabled,
      connectionState: 'connected' as const,
      transcript: localTranscript,
      audioLevel: localAudioLevel
    },
    ...Array.from(peers.values()).map(p => ({
      ...p,
      isLocal: false,
      audioLevel: p.userId === remotePeer?.userId ? remoteAudioLevel : 0
    }))
  ];

  // 모바일 그리드 뷰
  if (isMobileView && viewMode === 'grid') {
    return (
      <div className="flex flex-col h-full">
        {/* 상단: 상대방 화면 */}
        <div className="flex-1 relative">
          {remotePeer ? (
            <>
              <VideoPreview
                stream={remotePeer.stream || null}
                nickname={remotePeer.nickname}
                isVideoEnabled={remotePeer.videoEnabled}
              />
              <SubtitleOverlay
                transcript={remotePeer.transcript}
                targetLang={translationTargetLanguage}
              />
  {/* 음성 비주얼라이저 - 파일 스트리밍 중이 아닐 때만 표시 */}
  {!isFileStreaming && remotePeer.stream && (
    <VerticalAudioVisualizer
      audioLevel={remoteAudioLevel}
      isActive={remotePeer.audioEnabled}
      className="absolute left-4 top-1/2 -translate-y-1/2 z-30"
      showIcon={true}
    />
  )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full bg-muted/50 rounded-lg">
              <p className="text-muted-foreground">Waiting for participant...</p>
            </div>
          )}
        </div>

        {/* 하단: 내 화면 */}
        <div className="flex-1 relative">
          <VideoPreview
            stream={localStream}
            nickname={localNickname}
            isVideoEnabled={isVideoEnabled}
            isLocalVideo={true}
          />
          <SubtitleOverlay
            transcript={{ ...localTranscript, lang: 'en-US' }}
            targetLang="none"
          />
          
          {/* 모바일 카메라 전환 버튼 - 우측 상단 */}
          {isDeviceMobile && hasMultipleCameras && (
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
      </div>
    );
  }

  // 모바일 스피커 뷰
  if (isMobileView && viewMode === 'speaker') {
    return (
      <div className="relative h-full">
        {/* 메인 화면 (상대방) */}
        {remotePeer ? (
          <div className="absolute inset-0">
            <VideoPreview
              stream={remotePeer.stream || null}
              nickname={remotePeer.nickname}
              isVideoEnabled={remotePeer.videoEnabled}
            />
            <SubtitleOverlay
              transcript={remotePeer.transcript}
              targetLang={translationTargetLanguage}
            />
  {/* 음성 비주얼라이저 */}
  {!isFileStreaming && remotePeer.stream && (
    <VerticalAudioVisualizer
      audioLevel={remoteAudioLevel}
      isActive={remotePeer.audioEnabled}
      className="absolute left-4 top-1/2 -translate-y-1/2 z-30"
      showIcon={true}
    />
  )}
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
          // 숨긴 비디오 다시 보기 버튼
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

        {/* 모바일 카메라 전환 버튼 - 우측 상단 */}
        {isDeviceMobile && hasMultipleCameras && (
          <Button
            variant="ghost"
            size="sm"
            onClick={switchCamera}
            className="fixed top-4 right-4 w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm p-0 z-50"
          >
            <RotateCw className="w-5 h-5 text-white" />
          </Button>
        )}
      </div>
    );
  }

  // 데스크톱 뷰 (기존 코드)
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
            {/* 그리드 뷰에서도 오디오 비주얼라이저 표시 */}
            {!isFileStreaming && p.stream && (
              <VerticalAudioVisualizer
                audioLevel={p.audioLevel || 0}
                isActive={p.audioEnabled}
                className="absolute left-2 bottom-2 scale-75"
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
  {/* 음성 비주얼라이저 */}
  {!isFileStreaming && remotePeer.stream && (
    <VerticalAudioVisualizer
      audioLevel={remoteAudioLevel}
      isActive={remotePeer.audioEnabled}
      className="absolute left-8 top-1/2 -translate-y-1/2 z-30"
      showIcon={true}
    />
  )}
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
          transcript={{ ...localTranscript, lang: 'en-US' }}
          targetLang="none"
        />
      </div>
    </>
  );
};
