import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// 변경점: props에 장치 목록 추가
interface DeviceSelectorProps {
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  selectedVideoDevice: string;
  onAudioDeviceChange: (deviceId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
}

// 변경점: 내부 상태(useState)와 로직(useEffect)을 모두 제거하고 props에 의존하는 'Dumb Component'로 변경
export const DeviceSelector = ({
  audioDevices,
  videoDevices,
  selectedAudioDevice,
  selectedVideoDevice,
  onAudioDeviceChange,
  onVideoDeviceChange
}: DeviceSelectorProps) => {

  // 변경점: 핸들러가 props로 받은 함수를 직접 호출하도록 변경
  const handleAudioChange = (deviceId: string) => {
    onAudioDeviceChange(deviceId);
    const device = audioDevices.find(d => d.deviceId === deviceId);
    toast.success(`Switched to ${device?.label || "new microphone"}`);
  };

  const handleVideoChange = (deviceId: string) => {
    onVideoDeviceChange(deviceId);
    const device = videoDevices.find(d => d.deviceId === deviceId);
    toast.success(`Switched to ${device?.label || "new camera"}`);
  };

  return (
    <div className="space-y-4">
      {/* 오디오 장치 선택 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Microphone</Label>
        {/* 핵심: 장치 목록이 로드되기 전에 Skeleton UI를 보여주어 에러를 방지 */}
        {audioDevices.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedAudioDevice} onValueChange={handleAudioChange}>
            <SelectTrigger className="bg-input/50 border-border/50">
              <SelectValue placeholder="Select microphone..." />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 비디오 장치 선택 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Camera</Label>
        {videoDevices.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedVideoDevice} onValueChange={handleVideoChange}>
            <SelectTrigger className="bg-input/50 border-border/50">
              <SelectValue placeholder="Select camera..." />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
};
