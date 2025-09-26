import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';

interface VerticalAudioVisualizerProps {
  audioLevel: number;
  isActive: boolean;
  showIcon?: boolean;
  className?: string;
}

export const VerticalAudioVisualizer = ({ 
  audioLevel, 
  isActive,
  showIcon = false,
  className
}: VerticalAudioVisualizerProps) => {
  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const bars = Array.from({ length: 12 }, (_, i) => i);
  
  // 부드러운 애니메이션을 위한 레벨 스무딩
  useEffect(() => {
    const targetLevel = isActive ? audioLevel : 0;
    const diff = targetLevel - smoothedLevel;
    const step = diff * 0.3; // 스무딩 팩터
    
    const timer = setTimeout(() => {
      setSmoothedLevel(prev => {
        const newLevel = prev + step;
        return Math.max(0, Math.min(1, newLevel));
      });
    }, 16); // 약 60fps
    
    return () => clearTimeout(timer);
  }, [audioLevel, isActive, smoothedLevel]);
  
  const getBarColor = (index: number) => {
    const threshold = (index + 1) / bars.length;
    const isBarActive = smoothedLevel > threshold * 0.9;
    
    if (!isActive) return 'bg-gray-600';
    
    if (isBarActive) {
      // 레벨에 따른 색상
      if (threshold > 0.8) return 'bg-red-500';
      if (threshold > 0.6) return 'bg-yellow-500';
      if (threshold > 0.4) return 'bg-green-500';
      return 'bg-green-400';
    }
    
    return 'bg-gray-600';
  };
  
  return (
    <div className={cn(
      "bg-black/40 backdrop-blur-sm rounded-full p-2",
      className
    )}>
      <div className="flex flex-col items-center gap-1">
        {showIcon && (
          <div className="mb-1">
            {isActive ? (
              <Volume2 className="w-4 h-4 text-white/70" />
            ) : (
              <VolumeX className="w-4 h-4 text-white/30" />
            )}
          </div>
        )}
        
        <div className="flex flex-col-reverse items-center gap-0.5 h-32">
          {bars.map((index) => {
            const threshold = (index + 1) / bars.length;
            const isBarActive = smoothedLevel > threshold * 0.9;
            const barHeight = 2 + (index * 0.5); // 점진적 높이 증가
            
            return (
              <div
                key={index}
                className={cn(
                  "w-2 rounded-full transition-all duration-100",
                  getBarColor(index),
                  isBarActive && "shadow-lg"
                )}
                style={{
                  height: `${barHeight}px`,
                  opacity: isBarActive ? 1 : 0.2,
                  boxShadow: isBarActive ? `0 0 ${4 + index}px ${
                    threshold > 0.8 ? 'rgba(239, 68, 68, 0.6)' :
                    threshold > 0.6 ? 'rgba(245, 158, 11, 0.6)' :
                    'rgba(34, 197, 94, 0.6)'
                  }` : 'none'
                }}
              />
            );
          })}
        </div>
        
        {/* 레벨 인디케이터 텍스트 (옵션) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-[10px] text-white/50 mt-1">
            {Math.round(smoothedLevel * 100)}%
          </div>
        )}
      </div>
    </div>
  );
};