import { useState, useEffect, useRef } from 'react';
import { useUIManagementStore, ControlBarPosition } from '@/stores/useUIManagementStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { ControlBar } from './ControlBar';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

export const DraggableControlBar = () => {
    const isMobile = useIsMobile();
    const { controlBarPosition, setControlBarPosition, showControls } = useUIManagementStore();
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const dragStartOffset = useRef({ x: 0, y: 0 });

    const getSnapPosition = (pos: ControlBarPosition, width: number, height: number) => {
        const { innerWidth, innerHeight } = window;
        const margin = 24;
        switch (pos) {
            case 'top': return { x: innerWidth / 2 - width / 2, y: margin };
            case 'bottom': return { x: innerWidth / 2 - width / 2, y: innerHeight - height - margin };
            case 'left': return { x: margin, y: innerHeight / 2 - height / 2 };
            case 'right': return { x: innerWidth - width - margin, y: innerHeight / 2 - height / 2 };
        }
    };

    useEffect(() => {
        if (ref.current && !isDragging) {
            const { offsetWidth, offsetHeight } = ref.current;
            setPosition(getSnapPosition(controlBarPosition, offsetWidth, offsetHeight));
        }
    }, [controlBarPosition, isDragging]);

    useEffect(() => {
        const handleResize = () => {
            if (ref.current) {
                const { offsetWidth, offsetHeight } = ref.current;
                setPosition(getSnapPosition(controlBarPosition, offsetWidth, offsetHeight));
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, [controlBarPosition]);

    const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (isMobile) return;
        
        const target = e.target as HTMLElement;
        if (!target.closest('.drag-handle')) return;

        e.preventDefault();
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        setIsDragging(true);
        dragStartOffset.current = {
            x: clientX - position.x,
            y: clientY - position.y
        };
    };

    useEffect(() => {
        const handleInteractionMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            setPosition({
                x: clientX - dragStartOffset.current.x,
                y: clientY - dragStartOffset.current.y
            });
        };

        const handleInteractionEnd = () => {
            if (!isDragging) return;
            setIsDragging(false);

            const { innerWidth, innerHeight } = window;
            const dropX = position.x + (ref.current?.offsetWidth || 0) / 2;
            const dropY = position.y + (ref.current?.offsetHeight || 0) / 2;

            const yRatio = dropY / innerHeight;

            if (yRatio < 0.25) setControlBarPosition('top');
            else if (yRatio > 0.75) setControlBarPosition('bottom');
            else if (dropX < innerWidth / 2) setControlBarPosition('left');
            else setControlBarPosition('right');
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleInteractionMove);
            window.addEventListener('touchmove', handleInteractionMove);
            window.addEventListener('mouseup', handleInteractionEnd);
            window.addEventListener('touchend', handleInteractionEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleInteractionMove);
            window.removeEventListener('touchmove', handleInteractionMove);
            window.removeEventListener('mouseup', handleInteractionEnd);
            window.removeEventListener('touchend', handleInteractionEnd);
        };
    }, [isDragging, position, setControlBarPosition]);

    if (isMobile) {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50">
                <ControlBar />
            </div>
        );
    }
    
    const isVertical = controlBarPosition === 'left' || controlBarPosition === 'right';

    return (
        <div
            ref={ref}
            className={cn(
                "absolute z-50 flex items-center gap-1",
                "transition-opacity duration-300",
                showControls ? "opacity-100" : "opacity-0 pointer-events-none",
                isDragging && "cursor-grabbing",
                isVertical ? "flex-col" : "flex-row"
            )}
            style={{
                left: position.x,
                top: position.y,
                transition: isDragging ? 'none' : 'left 0.3s ease-out, top 0.3s ease-out',
            }}
        >
            <div
                className="drag-handle p-2 cursor-grab touch-none"
                onMouseDown={handleInteractionStart}
                onTouchStart={handleInteractionStart}
            >
                <GripVertical className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            <ControlBar isVertical={isVertical} />
        </div>
    );
};
