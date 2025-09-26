import { useEffect, useRef, useState } from 'react';

interface UseAudioLevelOptions {
  stream: MediaStream | null;
  enabled?: boolean;
  updateInterval?: number;
}

export const useAudioLevel = ({ 
  stream, 
  enabled = true,
  updateInterval = 100 
}: UseAudioLevelOptions) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!stream || !enabled) {
      setAudioLevel(0);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[AudioLevel] No audio tracks in stream');
      setAudioLevel(0);
      return;
    }

    try {
      // 오디오 컨텍스트 생성
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let lastUpdateTime = 0;
      
      const updateLevel = (currentTime: number) => {
        if (!analyserRef.current) return;
        
        // 업데이트 간격 제한
        if (currentTime - lastUpdateTime >= updateInterval) {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // RMS (Root Mean Square) 계산
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const normalizedLevel = Math.min(1, rms / 128); // 0-1 범위로 정규화
          
          setAudioLevel(normalizedLevel);
          lastUpdateTime = currentTime;
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      animationFrameRef.current = requestAnimationFrame(updateLevel);
      
    } catch (error) {
      console.error('[AudioLevel] Error setting up audio analysis:', error);
      setAudioLevel(0);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stream, enabled, updateInterval]);

  return audioLevel;
};