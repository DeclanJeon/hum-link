/**
 * @fileoverview 모바일 카메라 전환 토글
 * @module components/MobileCameraToggle
 */

import { Button } from "@/components/ui/button";
import { RotateCw, Loader2 } from "lucide-react";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useIsMobile } from "@/hooks/use-mobile";

export const MobileCameraToggle = () => {
  const { 
    isMobile, 
    videoInputs,
    isVideoEnabled,
    isSharingScreen,
    isChangingDevice,
    switchCamera
  } = useMediaDeviceStore();
  
  const isMobileView = useIsMobile();
  
  // 조건: 모바일 + 카메라 2개 이상 + 화면 공유 중 아님 + 비디오 활성화
  if (!isMobile || videoInputs.length < 2 || isSharingScreen || !isVideoEnabled) {
    return null;
  }
  
  // 모바일 뷰
  if (isMobileView) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={switchCamera}
        disabled={isChangingDevice}
        className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
      >
        {isChangingDevice ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <RotateCw className="w-5 h-5" />
        )}
        <span className="text-[10px]">
          {isChangingDevice ? '전환 중' : '카메라'}
        </span>
      </Button>
    );
  }
  
  // 데스크톱 뷰
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={switchCamera}
      disabled={isChangingDevice}
      className="rounded-full"
      title="카메라 전환"
    >
      {isChangingDevice ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <RotateCw className="w-5 h-5" />
      )}
    </Button>
  );
};
