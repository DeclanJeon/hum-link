/**
 * @fileoverview 설정 패널 (수정)
 * @module components/SettingsPanel
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { X, Mic, Video, Loader2 } from "lucide-react";
import { useMediaDeviceStore } from "@/stores/useMediaDeviceStore";
import { useTranscriptionStore, SUPPORTED_LANGUAGES, TRANSLATION_LANGUAGES } from '@/stores/useTranscriptionStore';
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

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
    changeVideoDevice
  } = useMediaDeviceStore();

  const {
    isTranscriptionEnabled,
    transcriptionLanguage,
    translationTargetLanguage,
    toggleTranscription,
    setTranscriptionLanguage,
    setTranslationTargetLanguage,
  } = useTranscriptionStore();

  /**
   * 오디오 디바이스 변경
   */
  const handleAudioDeviceChange = async (deviceId: string) => {
    await changeAudioDevice(deviceId);
  };

  /**
   * 비디오 디바이스 변경
   */
  const handleVideoDeviceChange = async (deviceId: string) => {
    await changeVideoDevice(deviceId);
  };

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
          {/* 오디오 설정 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Mic className="w-4 h-4" />
              오디오 설정
            </h3>
            
            <div>
              <Label htmlFor="microphone-select">마이크</Label>
              <div className="relative">
                <Select 
                  value={selectedAudioDeviceId} 
                  onValueChange={handleAudioDeviceChange}
                  disabled={isChangingDevice}
                >
                  <SelectTrigger id="microphone-select" disabled={isChangingDevice}>
                    <SelectValue placeholder="마이크 선택" />
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

          {/* 비디오 설정 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Video className="w-4 h-4" />
              비디오 설정
            </h3>
            
            <div>
              <Label htmlFor="camera-select">카메라</Label>
              <div className="relative">
                <Select 
                  value={selectedVideoDeviceId} 
                  onValueChange={handleVideoDeviceChange}
                  disabled={isChangingDevice}
                >
                  <SelectTrigger id="camera-select" disabled={isChangingDevice}>
                    <SelectValue placeholder="카메라 선택" />
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

          {/* 자막 및 번역 설정 */}
          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-lg font-medium">자막 및 번역</h3>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label htmlFor="transcription-switch">실시간 자막 활성화</Label>
                <p className="text-xs text-muted-foreground">
                  음성을 텍스트로 변환하여 다른 사용자에게 표시합니다.
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
                <Label htmlFor="speaking-language">내가 말하는 언어</Label>
                <Select value={transcriptionLanguage} onValueChange={setTranscriptionLanguage}>
                  <SelectTrigger id="speaking-language">
                    <SelectValue placeholder="언어 선택..." />
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
              <Label htmlFor="translation-language">자막 번역 언어</Label>
              <Select value={translationTargetLanguage} onValueChange={setTranslationTargetLanguage}>
                <SelectTrigger id="translation-language">
                  <SelectValue placeholder="언어 선택..." />
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

          {/* 액션 버튼 */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button onClick={onClose}>
              완료
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
