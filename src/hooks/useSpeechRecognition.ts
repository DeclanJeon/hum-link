// frontend/src/hooks/useSpeechRecognition.ts

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranscriptionStore } from '@/stores/useTranscriptionStore';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isApiSupported = !!SpeechRecognition;

interface SpeechRecognitionOptions {
  lang: string;
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (event: SpeechRecognitionErrorEvent) => void;
}

/**
 * 음성인식 Hook (자동 언어 감지 지원)
 */
export const useSpeechRecognition = ({ 
  lang, 
  onResult, 
  onEnd, 
  onError 
}: SpeechRecognitionOptions) => {
  const recognitionRef = useRef<typeof SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const listeningIntentRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  
  const { setDetectedLanguage } = useTranscriptionStore();

  /**
   * 음성인식 초기화
   */
  useEffect(() => {
    if (!isApiSupported) {
      console.warn('[SpeechRecognition] Web Speech API is not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    // 자동 언어 감지 설정
    if (lang === 'auto') {
      // Chrome/Edge: 여러 언어 후보 지정
      recognition.lang = 'ko-KR'; // 기본값
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3; // 다중 후보 활성화
    } else {
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
    }

    /**
     * 음성인식 결과 처리
     */
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      retryCountRef.current = 0;
      
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        
        // 자동 언어 감지 (첫 final 결과에서 언어 추출)
        if (lang === 'auto' && result.isFinal && result[0]) {
          const detectedLang = extractLanguageFromResult(result);
          if (detectedLang) {
            setDetectedLanguage(detectedLang);
            console.log(`[SpeechRecognition] Detected language: ${detectedLang}`);
          }
        }
        
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      
      if (finalTranscript) onResult(finalTranscript, true);
      if (interimTranscript) onResult(interimTranscript, false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecognition] Error:', event.error);
      if (onError) onError(event);
    };
    
    recognition.onend = () => {
      setIsListening(false);
      
      // 자동 재시작 로직
      if (listeningIntentRef.current) {
        if (retryCountRef.current < MAX_RETRIES) {
          setTimeout(() => {
            try {
              recognition.start();
              setIsListening(true);
              retryCountRef.current++;
            } catch(e) {
              console.error('[SpeechRecognition] Restart error:', e);
            }
          }, 250);
        } else {
          console.error('[SpeechRecognition] Max retries exceeded');
          retryCountRef.current = 0;
        }
      }
      if (onEnd) onEnd();
    };

    return () => {
      listeningIntentRef.current = false;
      recognition.stop();
    };
  }, [lang, onResult, onError, onEnd, setDetectedLanguage]);

  /**
   * 음성인식 시작
   */
  const start = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        listeningIntentRef.current = true;
        recognitionRef.current.start();
        setIsListening(true);
      } catch(e) {
        console.error('[SpeechRecognition] Start error:', e);
      }
    }
  }, [isListening]);

  /**
   * 음성인식 중지
   */
  const stop = useCallback(() => {
    if (recognitionRef.current && isListening) {
      listeningIntentRef.current = false;
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return { start, stop, isListening, isSupported: isApiSupported };
};

/**
 * 음성인식 결과에서 언어 추출 (휴리스틱)
 */
function extractLanguageFromResult(result: SpeechRecognitionResult): string | null {
  // Web Speech API는 공식적으로 감지 언어를 제공하지 않음
  // 대안: 텍스트 패턴 기반 추론 (간단한 휴리스틱)
  
  const text = result[0].transcript;
  
  // 한글 감지
  if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text)) {
    return 'ko-KR';
  }
  
  // 일본어 감지 (히라가나, 가타카나, 한자)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
    return 'ja-JP';
  }
  
  // 중국어 감지 (간체/번체)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return 'zh-CN';
  }
  
  // 아랍어 감지
  if (/[\u0600-\u06FF]/.test(text)) {
    return 'ar-SA';
  }
  
  // 기본값: 영어
  return 'en-US';
}
