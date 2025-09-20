import { useEffect, useRef, useState, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isApiSupported = !!SpeechRecognition;

interface SpeechRecognitionOptions {
  lang: string;
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (event: SpeechRecognitionErrorEvent) => void;
}

export const useSpeechRecognition = ({ lang, onResult, onEnd, onError }: SpeechRecognitionOptions) => {
  const recognitionRef = useRef<typeof SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  
  // [핵심 수정] 사용자의 '의도'를 저장합니다. API의 자동 종료와 사용자의 stop() 호출을 구분하기 위함입니다.
  const listeningIntentRef = useRef(false);
  
  // [추가] 재시도 횟수 관리
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!isApiSupported) {
      console.warn("Web Speech API is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // [추가] 인식 성공 시 재시도 횟수 초기화
      retryCountRef.current = 0;
      
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) onResult(finalTranscript, true);
      if (interimTranscript) onResult(interimTranscript, false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (onError) onError(event);
    };
    
    recognition.onend = () => {
      setIsListening(false);
      // [핵심 수정] 사용자가 명시적으로 stop을 호출하지 않았을 경우(의도가 true일 경우)에만 재시작합니다.
      if (listeningIntentRef.current) {
        if (retryCountRef.current < MAX_RETRIES) {
          setTimeout(() => {
            try {
              recognition.start();
              setIsListening(true);
              retryCountRef.current++;
            } catch(e) {
              console.error("Error restarting recognition:", e);
            }
          }, 250); // 짧은 딜레이 추가
        } else {
          console.error("Speech recognition failed after multiple retries.");
          // 사용자에게 UI적으로 실패를 알리는 로직 추가 (e.g., toast)
          retryCountRef.current = 0; // 재시도 횟수 초기화
        }
      }
      if (onEnd) onEnd();
    };

    // 언어가 변경될 때마다 기존 인스턴스를 정리하고 새로 생성합니다.
    return () => {
      listeningIntentRef.current = false;
      recognition.stop();
    };
  }, [lang, onResult, onError, onEnd]);

  const start = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        listeningIntentRef.current = true; // [핵심 수정] 듣기 '의도'를 true로 설정
        recognitionRef.current.start();
        setIsListening(true);
      } catch(e) {
        console.error("Error starting recognition:", e);
      }
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (recognitionRef.current && isListening) {
      listeningIntentRef.current = false; // [핵심 수정] 듣기 '의도'를 false로 설정
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return { start, stop, isListening, isSupported: isApiSupported };
};