/**
 * @fileoverview 자막 컨트롤 패널 컴포넌트 수정
 * @module components/FileStreaming/SubtitlePanel
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Subtitles, 
  Plus, 
  Minus, 
  Clock, 
  Upload, 
  X,
  RotateCcw
} from 'lucide-react';
import { useSubtitleStore } from '@/stores/useSubtitleStore';
import { toast } from 'sonner';
import { SubtitleStyleSettings } from './SubtitleStyleSettings';

/**
 * SubtitlePanel 컴포넌트 Props
 */
interface SubtitlePanelProps {
  /** 비디오 엘리먼트 ref */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 스트리밍 중 여부 */
  isStreaming: boolean;
}

/**
 * 자막 컨트롤 패널
 * VLC 플레이어 스타일의 자막 제어 기능 제공
 */
export const SubtitlePanel: React.FC<SubtitlePanelProps> = React.memo(({ 
  videoRef, 
  isStreaming 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    tracks,
    activeTrackId,
    syncOffset,
    speedMultiplier,
    isEnabled,
    addTrack,
    setActiveTrack,
    adjustSyncOffset,
    setSpeedMultiplier
  } = useSubtitleStore();
  
  /**
   * 다음 자막 트랙으로 전환
   */
  const cycleSubtitleTrack = useCallback((): void => {
    const trackIds = Array.from(tracks.keys());
    if (trackIds.length === 0) return;
    
    const currentIndex = trackIds.indexOf(activeTrackId || '');
    const nextIndex = (currentIndex + 1) % trackIds.length;
    setActiveTrack(trackIds[nextIndex]);
    
    const nextTrack = tracks.get(trackIds[nextIndex]);
    if (nextTrack) {
      toast.info(`Switched to: ${nextTrack.label}`);
    }
  }, [tracks, activeTrackId, setActiveTrack]);
  
  /**
   * 키보드 단축키 처리
   */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent): void => {
      // 입력 필드에서는 단축키 무시
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch(e.key.toLowerCase()) {
        case 'v':
          e.preventDefault();
          useSubtitleStore.setState({ isEnabled: !isEnabled });
          toast.info(`Subtitles ${!isEnabled ? 'enabled' : 'disabled'}`);
          break;
          
        case 'g':
          e.preventDefault();
          if (e.shiftKey) {
            adjustSyncOffset(-500); // Shift+G: 500ms 앞당기기
          } else {
            adjustSyncOffset(-50); // G: 50ms 앞당기기
          }
          break;
          
        case 'h':
          e.preventDefault();
          if (e.shiftKey) {
            adjustSyncOffset(500); // Shift+H: 500ms 늦추기
          } else {
            adjustSyncOffset(50); // H: 50ms 늦추기
          }
          break;
          
        case 'j':
          e.preventDefault();
          cycleSubtitleTrack();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isEnabled, adjustSyncOffset, cycleSubtitleTrack]);
  
  /**
   * 파일 선택 처리
   */
  const handleFileSelect = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (file) {
      await addTrack(file);
      // 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [addTrack]);
  
  /**
   * 동기화 오프셋 리셋
   */
  const resetSyncOffset = useCallback((): void => {
    useSubtitleStore.setState({ syncOffset: 0 });
    toast.info('Subtitle sync reset');
  }, []);
  
  return (
    <div className="subtitle-panel space-y-4 p-4 bg-secondary/50 rounded-lg">
      {/* 자막 파일 로드 섹션 */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.vtt,.ass,.ssa,.sub"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Load Subtitle
        </Button>
        
        <Select
          value={activeTrackId || 'none'} // 빈 문자열 대신 'none' 사용
          onValueChange={(value) => setActiveTrack(value === 'none' ? null : value)}
        >
          <SelectTrigger className="flex-1">
            <Subtitles className="w-4 h-4 mr-2" />
            <SelectValue placeholder="No subtitle">
              {activeTrackId ?
                tracks.get(activeTrackId)?.label :
                'No subtitle'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No subtitle</SelectItem> {/* 빈 문자열 대신 'none' */}
            {Array.from(tracks.values()).map(track => (
              <SelectItem key={track.id} value={track.id}>
                {track.label} ({track.language.toUpperCase()})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          variant={isEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => {
            useSubtitleStore.setState({ isEnabled: !isEnabled });
            toast.info(`Subtitles ${!isEnabled ? 'enabled' : 'disabled'}`);
          }}
          title="Toggle subtitle (V)"
        >
          {isEnabled ? 'ON' : 'OFF'}
        </Button>
      </div>
      
      {/* 동기화 조절 섹션 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Subtitle Delay
          </label>
          <span className="text-sm font-mono">
            {syncOffset > 0 ? '+' : ''}{(syncOffset / 1000).toFixed(2)}s
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => adjustSyncOffset(-500)}
            size="sm"
            variant="outline"
            title="Hasten subtitle by 500ms (Shift+G)"
          >
            <Minus className="w-3 h-3" />
            500ms
          </Button>
          
          <Button
            onClick={() => adjustSyncOffset(-50)}
            size="sm"
            variant="outline"
            title="Hasten subtitle by 50ms (G)"
          >
            <Minus className="w-3 h-3" />
            50ms
          </Button>
          
          <Slider
            value={[syncOffset]}
            onValueChange={([value]) => 
              useSubtitleStore.setState({ syncOffset: value })
            }
            min={-5000}
            max={5000}
            step={50}
            className="flex-1"
          />
          
          <Button
            onClick={() => adjustSyncOffset(50)}
            size="sm"
            variant="outline"
            title="Delay subtitle by 50ms (H)"
          >
            <Plus className="w-3 h-3" />
            50ms
          </Button>
          
          <Button
            onClick={() => adjustSyncOffset(500)}
            size="sm"
            variant="outline"
            title="Delay subtitle by 500ms (Shift+H)"
          >
            <Plus className="w-3 h-3" />
            500ms
          </Button>
          
          <Button
            onClick={resetSyncOffset}
            size="sm"
            variant="ghost"
            title="Reset sync"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* 자막 속도 조절 섹션 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Subtitle Speed</label>
          <span className="text-sm font-mono">
            {speedMultiplier.toFixed(2)}x
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setSpeedMultiplier(0.5)}
            size="sm"
            variant={speedMultiplier === 0.5 ? "default" : "outline"}
          >
            0.5x
          </Button>
          
          <Slider
            value={[speedMultiplier]}
            onValueChange={([value]) => setSpeedMultiplier(value)}
            min={0.5}
            max={2}
            step={0.1}
            className="flex-1"
          />
          
          <Button
            onClick={() => setSpeedMultiplier(2)}
            size="sm"
            variant={speedMultiplier === 2 ? "default" : "outline"}
          >
            2x
          </Button>
          
          <Button
            onClick={() => setSpeedMultiplier(1)}
            size="sm"
            variant="ghost"
            title="Reset speed"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* 스타일 설정 섹션 */}
      <SubtitleStyleSettings />
      
      {/* 키보드 단축키 안내 */}
      <div className="text-xs text-muted-foreground space-y-1 p-2 bg-background/50 rounded">
        <div className="font-medium mb-1">Keyboard shortcuts:</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 ml-2">
          <span><kbd>V</kbd> - Toggle subtitle</span>
          <span><kbd>J</kbd> - Cycle tracks</span>
          <span><kbd>G</kbd> / <kbd>H</kbd> - Adjust ±50ms</span>
          <span><kbd>Shift+G</kbd> / <kbd>H</kbd> - Adjust ±500ms</span>
        </div>
      </div>
    </div>
  );
});

SubtitlePanel.displayName = 'SubtitlePanel';
