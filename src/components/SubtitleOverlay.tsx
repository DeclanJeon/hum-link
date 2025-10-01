// frontend/src/components/SubtitleOverlay.tsx

import { useEffect, useState, useMemo, useRef } from 'react';
import { translationService } from '@/lib/translationService';

interface SubtitleOverlayProps {
  transcript?: { text: string; isFinal: boolean; lang?: string };
  targetLang: string;
}

/**
 * 자막 오버레이 컴포넌트
 * - 다중 번역 엔진 지원 (MyMemory 우선)
 * - 자동 숨김 기능 (3초 후 페이드아웃)
 */
export const SubtitleOverlay = ({ transcript, targetLang }: SubtitleOverlayProps) => {
  const [translatedText, setTranslatedText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout>();
  
  const translationId = useMemo(() => 
    transcript?.text, 
    [transcript?.text, transcript?.isFinal]
  );

  /**
   * 번역 실행
   */
  useEffect(() => {
    if (transcript?.isFinal && transcript.text && targetLang !== 'none') {
      const sourceLang = translationService.normalizeLanguageCode(
        transcript.lang || 'en'
      );
      const normalizedTarget = translationService.normalizeLanguageCode(targetLang);
      
      if (sourceLang !== normalizedTarget) {
        let isCancelled = false;
        const currentTranslationId = translationId;

        translationService.translate(transcript.text, sourceLang, normalizedTarget)
          .then(result => {
            if (!isCancelled && currentTranslationId === translationId) {
              setTranslatedText(result.text);
              
              // 번역 엔진 표시 (개발 모드)
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Subtitle] Translated via ${result.engine}`);
              }
            }
          })
          .catch(err => {
            console.error('[Subtitle] Translation error:', err);
            if (!isCancelled) setTranslatedText('');
          });

        return () => {
          isCancelled = true;
        };
      }
    } else {
      setTranslatedText('');
    }
  }, [transcript, targetLang, translationId]);

  /**
   * 자막 표시/숨김 로직
   * - 텍스트가 있으면 표시
   * - 3초 후 자동 페이드아웃
   */
  useEffect(() => {
    if (transcript?.text) {
      setIsVisible(true);
      
      // 기존 타이머 취소
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      
      // 10초 후 숨김 (final 자막만)
      if (transcript.isFinal) {
        hideTimerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 10000);
      }
    } else {
      setIsVisible(false);
    }
    
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [transcript?.text, transcript?.isFinal]);

  if (!transcript?.text || !isVisible) return null;

  return (
    <div 
      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-fit max-w-[90%] p-2.5 rounded-lg bg-black/60 backdrop-blur-md text-center pointer-events-none transition-opacity duration-300"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      {/* 원문 */}
      <p 
        className={`text-lg lg:text-xl font-semibold text-white transition-opacity duration-200 ${
          !transcript.isFinal ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {transcript.text}
      </p>
      
      {/* 번역문 */}
      {translatedText && (
        <p className="text-md lg:text-lg text-cyan-300 mt-1 font-medium">
          {translatedText}
        </p>
      )}
    </div>
  );
};
