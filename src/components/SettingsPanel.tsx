/**
 * @fileoverview   ()
 * @module components/SettingsPanel
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { X, Mic, Video, Loader2, Captions, Tv, ScreenShare } from "lucide-react";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useTranscriptionStore, SUPPORTED_LANGUAGES, TRANSLATION_LANGUAGES } from '@/stores/useTranscriptionStore';
import { useUIManagementStore, ControlBarSize } from '@/stores/useUIManagementStore';
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel = ({ isOpen, onClose }: SettingsPanelProps) => {
  const {
    audioInputs,
    videoInputs,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    isChangingDevice,
    changeAudioDevice,
    changeVideoDevice,
    includeCameraInScreenShare,
    setIncludeCameraInScreenShare
  } = useMediaDeviceStore();

  const {
    isTranscriptionEnabled,
    transcriptionLanguage,
    translationTargetLanguage,
    toggleTranscription,
    setTranscriptionLanguage,
    setTranslationTargetLanguage,
  } = useTranscriptionStore();

  const { controlBarSize, setControlBarSize } = useUIManagementStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            설정
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Mic className="w-4 h-4" />
              오디오 장치
            </h3>
            <div>
              <Label htmlFor="microphone-select">마이크</Label>
              <div className="relative">
                <Select 
                  value={selectedAudioDeviceId} 
                  onValueChange={changeAudioDevice}
                  disabled={isChangingDevice}
                >
                  <SelectTrigger id="microphone-select" disabled={isChangingDevice}>
                    <SelectValue placeholder="마이크를 선택하세요..." />
                  </SelectTrigger>
                  <SelectContent>
                    {audioInputs.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
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

          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Video className="w-4 h-4" />
              비디오 장치
            </h3>
            <div>
              <Label htmlFor="camera-select">카메라</Label>
              <div className="relative">
                <Select 
                  value={selectedVideoDeviceId} 
                  onValueChange={changeVideoDevice}
                  disabled={isChangingDevice}
                >
                  <SelectTrigger id="camera-select" disabled={isChangingDevice}>
                    <SelectValue placeholder="카메라를 선택하세요..." />
                  </SelectTrigger>
                  <SelectContent>
                    {videoInputs.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
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

          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-lg font-medium flex items-center gap-2">
                <ScreenShare className="w-4 h-4" />
                화면 공유
            </h3>
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="include-camera-switch">화면 공유 시 내 카메라 포함</Label>
                <p className="text-xs text-muted-foreground">
                  화면 공유 중 우측 하단에 자신의 카메라 화면을 함께 표시합니다.
                </p>
              </div>
              <Switch
                id="include-camera-switch"
                checked={includeCameraInScreenShare}
                onCheckedChange={setIncludeCameraInScreenShare}
              />
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-lg font-medium flex items-center gap-2">
                <Tv className="w-4 h-4" />
                인터페이스
            </h3>
            <div>
                <Label htmlFor="control-bar-size">컨트롤 바 크기</Label>
                <RadioGroup
                    id="control-bar-size"
                    value={controlBarSize}
                    onValueChange={(value) => setControlBarSize(value as ControlBarSize)}
                    className="flex items-center gap-4 mt-2"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sm" id="size-sm" />
                        <Label htmlFor="size-sm">작게</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="md" id="size-md" />
                        <Label htmlFor="size-md">중간</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="lg" id="size-lg" />
                        <Label htmlFor="size-lg">크게</Label>
                    </div>
                </RadioGroup>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Captions className="w-4 h-4" />
              자막 및 번역
            </h3>
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="transcription-switch">자막 활성화</Label>
                <p className="text-xs text-muted-foreground">
                    자신의 음성을 텍스트로 변환하여 다른 사람에게 보여줍니다.
                </p>
              </div>
              <Switch
                id="transcription-switch"
                checked={isTranscriptionEnabled}
                onCheckedChange={toggleTranscription}
              />
            </div>
            {isTranscriptionEnabled && (
              <div>
                <Label htmlFor="speaking-language">음성 언어</Label>
                <Select value={transcriptionLanguage} onValueChange={setTranscriptionLanguage}>
                  <SelectTrigger id="speaking-language">
                    <SelectValue placeholder="사용할 언어를 선택하세요..." />
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
              </div>
            )}
            <div>
              <Label htmlFor="translation-language">번역 언어</Label>
              <Select value={translationTargetLanguage} onValueChange={setTranslationTargetLanguage}>
                <SelectTrigger id="translation-language">
                  <SelectValue placeholder="번역할 언어를 선택하세요..." />
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

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button onClick={onClose}>
              닫기
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
