import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceInfo } from '@/lib/deviceUtils';

interface DeviceSelectorProps {
  audioDevices: DeviceInfo[];
  videoDevices: DeviceInfo[];
  selectedAudioDevice: string;
  selectedVideoDevice: string;
  onAudioDeviceChange: (deviceId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
}

export const DeviceSelector = ({
  audioDevices,
  videoDevices,
  selectedAudioDevice,
  selectedVideoDevice,
  onAudioDeviceChange,
  onVideoDeviceChange
}: DeviceSelectorProps) => {

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Microphone</Label>
        {audioDevices.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedAudioDevice} onValueChange={onAudioDeviceChange}>
            <SelectTrigger className="bg-input/50 border-border/50">
              <SelectValue placeholder="Select microphone..." />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.filter(device => device.deviceId !== "").map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Camera</Label>
        {videoDevices.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedVideoDevice} onValueChange={onVideoDeviceChange}>
            <SelectTrigger className="bg-input/50 border-border/50">
              <SelectValue placeholder="Select camera..." />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.filter(device => device.deviceId !== "").map((device) => (
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
