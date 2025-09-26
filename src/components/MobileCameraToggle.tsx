import { Button } from "@/components/ui/button";
import { Camera, CameraOff, RotateCw } from "lucide-react";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useIsMobile } from "@/hooks/use-mobile";

export const MobileCameraToggle = () => {
  const { 
    isMobile, 
    hasMultipleCameras, 
    cameraFacing, 
    switchCamera, 
    isSharingScreen,
    isVideoEnabled 
  } = useMediaDeviceStore();
  
  const isMobileView = useIsMobile();
  
  // 모바일이 아니거나 카메라가 하나뿐이거나 화면 공유 중이면 표시하지 않음
  if (!isMobile || !hasMultipleCameras || isSharingScreen || !isVideoEnabled) {
    return null;
  }
  
  // 모바일 뷰에서의 렌더링
  if (isMobileView) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={switchCamera}
        className="flex-1 max-w-[60px] h-12 rounded-xl flex flex-col gap-1 p-1"
      >
        <RotateCw className="w-5 h-5" />
        <span className="text-[10px]">Flip</span>
      </Button>
    );
  }
  
  // 데스크톱에서 모바일 디바이스 사용 시
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={switchCamera}
      className="rounded-full"
      title={`Switch to ${cameraFacing === 'user' ? 'back' : 'front'} camera`}
    >
      <RotateCw className="w-5 h-5" />
    </Button>
  );
};