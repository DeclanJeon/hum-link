import { VideoPreview } from "@/components/VideoPreview";
import { PeerState, useWebRTCStore } from "@/stores/useWebRTCStore";
import { ViewMode } from "@/stores/useUIManagementStore";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { SubtitleOverlay } from './SubtitleOverlay'; // SubtitleOverlay 임포트

interface VideoLayoutProps {
  viewMode: ViewMode;
  localStream: MediaStream | null;
  localNickname: string;
  localVideoEnabled: boolean;
  peers: PeerState[];
  localTranscript: { text: string; isFinal: boolean }; // 로컬 자막 데이터 추가
  translationTargetLanguage: string; // 번역 언어 설정 추가
}

export const VideoLayout = ({ viewMode, localStream, localNickname, localVideoEnabled, peers, localTranscript, translationTargetLanguage }: VideoLayoutProps) => {
  // useWebRTCStore에서 transcriptionLanguage 가져오기
  const transcriptionLanguage = useWebRTCStore((state) => state.transcriptionLanguage);
  const allParticipants = [
    {
      isLocal: true,
      userId: 'local',
      nickname: localNickname,
      stream: localStream,
      videoEnabled: localVideoEnabled,
      connectionState: 'connected',
      transcript: localTranscript // 로컬 참가자에 자막 데이터 추가
    },
    ...peers.map(p => ({ ...p, isLocal: false }))
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
            {/* ✨ 참가자 자막 오버레이 ✨ */}
            <SubtitleOverlay
              transcript={p.transcript ? { ...p.transcript, lang: (p.transcript as { text: string; isFinal: boolean; lang?: string }).lang || 'en-US' } : undefined}
              targetLang={p.isLocal ? "none" : translationTargetLanguage} // 로컬 사용자는 번역하지 않음
            />
          </div>
        ))}
      </div>
    );
  }

  // 'speaker' 뷰 모드
  const remotePeer = peers.length > 0 ? peers[0] : null;

  return (
    <>
      {remotePeer ? (
        <div className="absolute inset-4">
          <VideoPreview
            stream={remotePeer.stream || null}
            nickname={remotePeer.nickname}
            isVideoEnabled={remotePeer.videoEnabled}
          />
          {/* ✨ 원격 피어 자막 오버레이 ✨ */}
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
          isVideoEnabled={localVideoEnabled}
          isLocalVideo={true}
        />
        {/* ✨ 로컬 사용자 자막 오버레이 ✨ */}
        <SubtitleOverlay
          transcript={{ ...localTranscript, lang: transcriptionLanguage }} // 실제 언어 설정으로 변경 필요
          targetLang="none" // 내 자막은 번역하지 않음
        />
      </div>
    </>
  );
};
