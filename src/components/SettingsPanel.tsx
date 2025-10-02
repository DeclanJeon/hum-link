import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { X, Mic, Video, Volume2, Settings, MessageSquare } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Switch } from "@/components/ui/switch";
import { useTranscriptionStore } from "@/stores/useTranscriptionStore";
import { SUPPORTED_LANGUAGES, TRANSLATION_LANGUAGES } from '@/stores/useTranscriptionStore';
import { useLobbyStore } from '@/stores/useLobbyStore';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel = ({ isOpen, onClose }: SettingsPanelProps) => {
  const {
    audioDevices,
    videoDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    micVolume,
    speakerVolume,
    setSelectedAudioDevice,
    setSelectedVideoDevice,
    setMicVolume,
    setSpeakerVolume,
    initializeDevices
  } = useSettingsStore();

  // <<< [수정] useTranscriptionStore에서 상태와 액션 가져오기
  const {
    isTranscriptionEnabled,
    transcriptionLanguage,
    translationTargetLanguage,
    toggleTranscription,
    setTranscriptionLanguage,
    setTranslationTargetLanguage,
  } = useTranscriptionStore();

  useEffect(() => {
    if (isOpen) {
      initializeDevices();
    }
  }, [isOpen, initializeDevices]);

  // DeviceSelector에 onChange 핸들러 추가
  const handleAudioDeviceChange = async (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    
    // Lobby에서 사용 중이면 실시간 적용
    const { stream, setSelectedAudioDevice: lobbySetAudio } = useLobbyStore.getState();
    if (stream) {
      // toast를 전달하지 않기 위해 직접 스트림 변경
      if (stream) {
        try {
          // 새 오디오 스트림 생성
          const newAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId } }
          });
          
          const newAudioTrack = newAudioStream.getAudioTracks()[0];
          
          if (newAudioTrack) {
            // 기존 오디오 트랙 교체
            const oldAudioTrack = stream.getAudioTracks()[0];
            if (oldAudioTrack) {
              stream.removeTrack(oldAudioTrack);
              oldAudioTrack.stop();
            }
            
            stream.addTrack(newAudioTrack);
            
            // 오디오 분석 재초기화
            const { initializeAudioAnalysis } = useLobbyStore.getState();
            initializeAudioAnalysis(stream);
          }
        } catch (error) {
          console.error('[SettingsPanel] Failed to change audio device:', error);
        }
      }
    }
  };

  const handleVideoDeviceChange = async (deviceId: string) => {
    setSelectedVideoDevice(deviceId);
    
    // Lobby에서 사용 중이면 실시간 적용
    const { stream, setSelectedVideoDevice: lobbySetVideo } = useLobbyStore.getState();
    if (stream) {
      // toast를 전달하지 않기 위해 직접 스트림 변경
      if (stream) {
        try {
          // 새 비디오 스트림 생성
          const newVideoStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
          
          const newVideoTrack = newVideoStream.getVideoTracks()[0];
          
          if (newVideoTrack) {
            // 기존 비디오 트랙 교체
            const oldVideoTrack = stream.getVideoTracks()[0];
            if (oldVideoTrack) {
              const wasEnabled = oldVideoTrack.enabled;
              
              stream.removeTrack(oldVideoTrack);
              oldVideoTrack.stop();
              
              stream.addTrack(newVideoTrack);
              newVideoTrack.enabled = wasEnabled;
            }
          }
        } catch (error) {
          console.error('[SettingsPanel] Failed to change video device:', error);
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Audio Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Audio Settings
            </h3>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="microphone-select">Microphone</Label>
                <Select value={selectedAudioDevice} onValueChange={handleAudioDeviceChange}>
                  <SelectTrigger id="microphone-select">
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="mic-volume">Microphone Volume</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    id="mic-volume"
                    value={micVolume}
                    onValueChange={setMicVolume}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8">{micVolume[0]}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="speaker-volume">Speaker Volume</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    id="speaker-volume"
                    value={speakerVolume}
                    onValueChange={setSpeakerVolume}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8">{speakerVolume[0]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Video Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Video className="w-4 h-4" />
              Video Settings
            </h3>
            
            <div>
              <Label htmlFor="camera-select">Camera</Label>
              <Select value={selectedVideoDevice} onValueChange={handleVideoDeviceChange}>
                <SelectTrigger id="camera-select">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {videoDevices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* [추가] Transcription & Translation Settings */}
          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Subtitles & Translation
            </h3>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="transcription-switch">Enable Real-time Subtitles</Label>
                <p className="text-xs text-muted-foreground">
                  Your speech will be converted to text for others.
                </p>
              </div>
              <Switch
                id="transcription-switch"
                checked={isTranscriptionEnabled}
                onCheckedChange={toggleTranscription}
              />
            </div>

            {isTranscriptionEnabled && (
              <div className="space-y-3">
                {/* 음성인식 언어 선택 */}
                <div>
                  <Label htmlFor="speaking-language">My Speaking Language</Label>
                  <Select value={transcriptionLanguage} onValueChange={setTranscriptionLanguage}>
                    <SelectTrigger id="speaking-language">
                      <SelectValue placeholder="Select language..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {SUPPORTED_LANGUAGES.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>
                          <span className="mr-2">{lang.flag}</span>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {transcriptionLanguage === 'auto'
                      ? '자동으로 언어를 감지합니다'
                      : '선택한 언어로 음성을 인식합니다'}
                  </p>
                </div>
              </div>
            )}
            
            {/* 번역 언어 선택 */}
            <div>
              <Label htmlFor="translation-language">Translate Subtitles To</Label>
              <Select value={translationTargetLanguage} onValueChange={setTranslationTargetLanguage}>
                <SelectTrigger id="translation-language">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {TRANSLATION_LANGUAGES.map(lang => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>
              Apply Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};// frontend/src/components/SettingsPanel.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { X, Mic, Video, Volume2, Settings, MessageSquare, Loader2 } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { Switch } from "@/components/ui/switch";
import { useTranscriptionStore } from "@/stores/useTranscriptionStore";
import { SUPPORTED_LANGUAGES, TRANSLATION_LANGUAGES } from '@/stores/useTranscriptionStore';
import { toast } from "sonner";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel = ({ isOpen, onClose }: SettingsPanelProps) => {
  const {
    audioDevices,
    videoDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    micVolume,
    speakerVolume,
    setSelectedAudioDevice,
    setSelectedVideoDevice,
    setMicVolume,
    setSpeakerVolume,
    initializeDevices
  } = useSettingsStore();

  // MediaDeviceStore에서 통합 메서드 가져오기
  const { 
    changeAudioDevice, 
    changeVideoDevice,
    isChangingDevice 
  } = useMediaDeviceStore();
  
  // 자막 및 번역 설정
  const {
    isTranscriptionEnabled,
    transcriptionLanguage,
    translationTargetLanguage,
    toggleTranscription,
    setTranscriptionLanguage,
    setTranslationTargetLanguage,
  } = useTranscriptionStore();

  useEffect(() => {
    if (isOpen) {
      initializeDevices();
    }
  }, [isOpen, initializeDevices]);

  /**
   * 오디오 디바이스 변경 핸들러
   */
  const handleAudioDeviceChange = async (deviceId: string) => {
    const success = await changeAudioDevice(deviceId);
    
    if (success) {
      // SettingsStore 상태 동기화
      setSelectedAudioDevice(deviceId);
    }
  };

  /**
   * 비디오 디바이스 변경 핸들러
   */
  const handleVideoDeviceChange = async (deviceId: string) => {
    const success = await changeVideoDevice(deviceId);
    
    if (success) {
      // SettingsStore 상태 동기화
      setSelectedVideoDevice(deviceId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Audio Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Audio Settings
            </h3>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="microphone-select">Microphone</Label>
                <div className="relative">
                  <Select 
                    value={selectedAudioDevice} 
                    onValueChange={handleAudioDeviceChange}
                    disabled={isChangingDevice}
                  >
                    <SelectTrigger id="microphone-select" disabled={isChangingDevice}>
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioDevices.map((device) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isChangingDevice && (
                    <div className="absolute right-10 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="mic-volume">Microphone Volume</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    id="mic-volume"
                    value={micVolume}
                    onValueChange={setMicVolume}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8">{micVolume[0]}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="speaker-volume">Speaker Volume</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    id="speaker-volume"
                    value={speakerVolume}
                    onValueChange={setSpeakerVolume}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8">{speakerVolume[0]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Video Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Video className="w-4 h-4" />
              Video Settings
            </h3>
            
            <div>
              <Label htmlFor="camera-select">Camera</Label>
              <div className="relative">
                <Select 
                  value={selectedVideoDevice} 
                  onValueChange={handleVideoDeviceChange}
                  disabled={isChangingDevice}
                >
                  <SelectTrigger id="camera-select" disabled={isChangingDevice}>
                    <SelectValue placeholder="Select camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isChangingDevice && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transcription & Translation Settings */}
          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Subtitles & Translation
            </h3>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="transcription-switch">Enable Real-time Subtitles</Label>
                <p className="text-xs text-muted-foreground">
                  Your speech will be converted to text for others.
                </p>
              </div>
              <Switch
                id="transcription-switch"
                checked={isTranscriptionEnabled}
                onCheckedChange={toggleTranscription}
              />
            </div>

            {isTranscriptionEnabled && (
              <div className="space-y-3">
                {/* 말하는 언어 선택 */}
                <div>
                  <Label htmlFor="speaking-language">My Speaking Language</Label>
                  <Select value={transcriptionLanguage} onValueChange={setTranscriptionLanguage}>
                    <SelectTrigger id="speaking-language">
                      <SelectValue placeholder="Select language..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {SUPPORTED_LANGUAGES.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>
                          <span className="mr-2">{lang.flag}</span>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {transcriptionLanguage === 'auto'
                      ? '자동으로 언어를 감지합니다'
                      : '선택한 언어로 음성을 인식합니다'}
                  </p>
                </div>
              </div>
            )}
            
            {/* 자막 번역 언어 선택 */}
            <div>
              <Label htmlFor="translation-language">Translate Subtitles To</Label>
              <Select value={translationTargetLanguage} onValueChange={setTranslationTargetLanguage}>
                <SelectTrigger id="translation-language">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {TRANSLATION_LANGUAGES.map(lang => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>
              Apply Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
