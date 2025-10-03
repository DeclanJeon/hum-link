import { useMemo } from 'react';
import { useUIManagementStore } from '@/stores/useUIManagementStore';
import { useParticipants, Participant } from '@/hooks/useParticipants';
import { useSessionStore } from '@/stores/useSessionStore';
import { VideoLayout } from './VideoLayout';
import { cn } from '@/lib/utils';
import { VideoPreview } from './VideoPreview';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScreenShare } from 'lucide-react';

const MainContentViewer = ({ participant }: { participant: Participant }) => {
    return (
        <div className="w-full h-full bg-black flex items-center justify-center">
            <VideoPreview
                stream={participant.stream}
                isVideoEnabled={true}
                nickname={participant.nickname}
                isLocalVideo={participant.isLocal}
                showSubtitles={false}
            />
        </div>
    );
};

const ParticipantGallery = ({ participants, mainParticipantId }: { participants: Participant[], mainParticipantId: string | null }) => {
    const isMobile = useIsMobile();
    const galleryHeight = isMobile ? 'h-24' : 'h-32';
    const videoAspect = 'aspect-video';

    if (participants.length === 0) return null;

    return (
        <div className={cn("bg-background/80 backdrop-blur-sm p-2 flex items-center space-x-2 overflow-x-auto", galleryHeight)}>
            {participants.map(p => (
                <div 
                    key={p.userId} 
                    className={cn(
                        "h-full flex-shrink-0 rounded-md overflow-hidden relative group", 
                        videoAspect,
                        p.userId === mainParticipantId && "ring-2 ring-blue-500 ring-offset-2 ring-offset-background"
                    )}
                >
                    <VideoPreview
                        stream={p.stream}
                        isVideoEnabled={p.videoEnabled}
                        nickname={p.nickname}
                        isLocalVideo={p.isLocal}
                        showSubtitles={false}
                    />
                    {p.userId === mainParticipantId && (
                        <div className="absolute top-1 left-1 bg-blue-500/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                            <ScreenShare size={12} />
                            <span>Sharing</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export const ContentLayout = () => {
    const { mainContentParticipantId } = useUIManagementStore();
    const participants = useParticipants();
    const localUserId = useSessionStore(state => state.userId);

    const mainParticipant = participants.find(p => p.userId === mainContentParticipantId);
    
    const galleryParticipants = useMemo(() => {
        if (!mainParticipant) {
            return participants;
        }

        const otherParticipants = participants.filter(p => p.userId !== mainParticipant.userId);
        
        if (mainParticipant.isLocal) {
            return otherParticipants;
        }

        const isLocalInGallery = otherParticipants.some(p => p.isLocal);
        if (!isLocalInGallery) {
            const localUser = participants.find(p => p.isLocal);
            if (localUser) {
                return [localUser, ...otherParticipants];
            }
        }
        return otherParticipants;

    }, [participants, mainParticipant]);


    if (mainParticipant) {
        return (
            <div className="w-full h-full flex flex-col">
                <div className="flex-1 relative overflow-hidden">
                    <MainContentViewer participant={mainParticipant} />
                </div>
                <ParticipantGallery 
                    participants={galleryParticipants} 
                    mainParticipantId={mainParticipant.userId} 
                />
            </div>
        );
    }

    return <VideoLayout />;
};
