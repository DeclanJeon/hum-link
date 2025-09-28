import { useEffect, useState, useMemo } from 'react';
import translate from 'translate';

interface SubtitleOverlayProps {
  transcript?: { text: string; isFinal: boolean; lang?: string };
  targetLang: string;
}

// 번역 엔진 설정 (무료 API 사용 시 주의사항 있음)
translate.engine = "google"; // 또는 "deepl", "yandex" 등
// translate.key = "YOUR_API_KEY"; // 유료 API 사용 시 필요

export const SubtitleOverlay = ({ transcript, targetLang }: SubtitleOverlayProps) => {
  const [translatedText, setTranslatedText] = useState('');
  const translationId = useMemo(() => transcript?.text, [transcript?.text, transcript?.isFinal]);

  useEffect(() => {
    if (transcript?.isFinal && transcript.text && targetLang !== 'none') {
      const sourceLang = transcript.lang?.split('-')[0] || 'en';
      if (sourceLang !== targetLang) {
        let isCancelled = false;
        const currentTranslationId = translationId;

        translate(transcript.text, { from: sourceLang, to: targetLang })
          .then(text => {
            if (!isCancelled && currentTranslationId === translationId) {
              setTranslatedText(text);
            }
          })
          .catch(err => {
            console.error("Translation error:", err);
            if (!isCancelled) setTranslatedText('');
          });

        return () => {
          isCancelled = true;
        };
      }
    } else {
      setTranslatedText(''); // 번역이 필요 없거나 중간 결과일 경우 비움
    }
  }, [transcript, targetLang, translationId]);

  if (!transcript?.text) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-fit max-w-[90%] p-2.5 rounded-lg bg-black/60 backdrop-blur-md text-center pointer-events-none">
      <p className={`text-lg lg:text-xl font-semibold text-white transition-opacity duration-200 ${!transcript.isFinal ? 'opacity-60' : 'opacity-100'}`}>
        {transcript.text}
      </p>
      {translatedText && (
        <p className="text-md lg:text-lg text-cyan-300 mt-1 font-medium">{translatedText}</p>
      )}
    </div>
  );
};
