import { useEffect, useRef } from 'react';
import { useUIManagementStore } from '@/stores/useUIManagementStore';

export function useAutoHideControls(timeout: number = 3000) {
  const { setShowControls } = useUIManagementStore();
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  const handleActivity = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, timeout);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    // 초기 로드 시 컨트롤 표시
    handleActivity();

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [timeout, setShowControls]);
}
