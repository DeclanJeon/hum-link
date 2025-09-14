import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface DeviceSelectorProps {
  selectedAudioDevice: string;
  selectedVideoDevice: string;
  onAudioDeviceChange: (deviceId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
}

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: string;
}

// Formula 7: Thinking Evolution - Devices that learn with you
export const DeviceSelector = ({
  selectedAudioDevice,
  selectedVideoDevice,
  onAudioDeviceChange,
  onVideoDeviceChange
}: DeviceSelectorProps) => {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    loadDevices();

    // Load previously used devices from localStorage
    const storedAudio = localStorage.getItem("preferredAudioDevice");
    const storedVideo = localStorage.getItem("preferredVideoDevice");
    
    if (storedAudio) onAudioDeviceChange(storedAudio);
    if (storedVideo) onVideoDeviceChange(storedVideo);
  }, [onAudioDeviceChange, onVideoDeviceChange]);

  const loadDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputs = devices
        .filter(device => device.kind === "audioinput" && device.deviceId !== "default")
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${audioDevices.length + 1}`,
          kind: device.kind
        }));

      const videoInputs = devices
        .filter(device => device.kind === "videoinput")
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${videoDevices.length + 1}`,
          kind: device.kind
        }));

      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);

      // Auto-select first available devices if none selected
      if (!selectedAudioDevice && audioInputs.length > 0) {
        onAudioDeviceChange(audioInputs[0].deviceId);
      }
      if (!selectedVideoDevice && videoInputs.length > 0) {
        onVideoDeviceChange(videoInputs[0].deviceId);
      }

    } catch (error) {
      toast.error("Could not load device list");
      console.error("Device enumeration error:", error);
    }
  };

  const handleAudioChange = (deviceId: string) => {
    onAudioDeviceChange(deviceId);
    localStorage.setItem("preferredAudioDevice", deviceId);
    
    const device = audioDevices.find(d => d.deviceId === deviceId);
    toast.success(`Switched to ${device?.label || "new microphone"}`);
  };

  const handleVideoChange = (deviceId: string) => {
    onVideoDeviceChange(deviceId);
    localStorage.setItem("preferredVideoDevice", deviceId);
    
    const device = videoDevices.find(d => d.deviceId === deviceId);
    toast.success(`Switched to ${device?.label || "new camera"}`);
  };

  return (
    <div className="space-y-4">
      {/* Audio Device Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Microphone</Label>
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
      </div>

      {/* Video Device Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Camera</Label>
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
      </div>

      {/* Recently Used Devices */}
      {(localStorage.getItem("preferredAudioDevice") || localStorage.getItem("preferredVideoDevice")) && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            💡 Your preferred devices are remembered for next time
          </p>
        </div>
      )}
    </div>
  );
};