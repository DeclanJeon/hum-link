// frontend/src/components/MobileCameraToggle.tsx
import { Button } from "@/components/ui/button";
import { RotateCw, Loader2 } from "lucide-react";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useIsMobile } from "@/hooks/use-mobile";

export const MobileCameraToggle = () => {
  const { 
    isMobile, 
    hasMultipleCameras, 
    cameraFacing, 
    switchCamera, 
    isSharingScreen,
    isVideoEnabled,
    isSwitchingCamera
  } = useMediaDeviceStore();
  
  const isMobileView = useIsMobile();
  
  // 조건: 모바일 + 카메라 2개 이상 + 화면 공유 중 아님 + 비디오 켜짐
  if (!isMobile || !hasMultipleCameras || isSharingScreen || !isVideoEnabled) {
    return null;
  }
  
  // 모바일 뷰
  if (isMobileView) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={switchCamera}
        disabled={isSwitchingCamera}
        className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
      >
        {isSwitchingCamera ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <RotateCw className="w-5 h-5" />
        )}
        <span className="text-[10px]">
          {isSwitchingCamera ? '전환중' : '전환'}
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
      disabled={isSwitchingCamera}
      className="rounded-full"
      title={`${cameraFacing === 'user' ? '후면' : '전면'} 카메라로 전환`}
    >
      {isSwitchingCamera ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <RotateCw className="w-5 h-5" />
      )}
    </Button>
  );
};
