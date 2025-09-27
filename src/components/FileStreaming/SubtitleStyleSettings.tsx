/**
 * @fileoverview 자막 스타일 설정 컴포넌트
 * @module components/FileStreaming/SubtitleStyleSettings
 */

import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Settings, Type, Palette } from 'lucide-react';
import { useSubtitleStore, SubtitleStyle } from '@/stores/useSubtitleStore';

/**
 * 자막 스타일 설정 컴포넌트
 * 폰트, 색상, 크기 등 자막 표시 스타일 커스터마이징
 */
export const SubtitleStyleSettings: React.FC = React.memo(() => {
  const { style, position, updateStyle, setPosition } = useSubtitleStore();
  
  /**
   * 색상 선택 처리
   */
  const handleColorChange = useCallback((
    property: keyof SubtitleStyle,
    value: string
  ): void => {
    updateStyle({ [property]: value });
  }, [updateStyle]);
  
  /**
   * 투명도 변경 처리
   */
  const handleOpacityChange = useCallback((value: number[]): void => {
    updateStyle({ backgroundOpacity: value[0] });
  }, [updateStyle]);
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Style Settings
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Subtitle Style</h4>
          
          {/* 위치 설정 */}
          <div className="space-y-2">
            <Label className="text-xs">Position</Label>
            <Select value={position} onValueChange={setPosition as any}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top</SelectItem>
                <SelectItem value="bottom">Bottom</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* 폰트 크기 */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Type className="w-3 h-3" />
              Font Size
            </Label>
            <Select 
              value={style.fontSize} 
              onValueChange={(value) => 
                updateStyle({ fontSize: value as SubtitleStyle['fontSize'] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="xlarge">Extra Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* 폰트 굵기 */}
          <div className="space-y-2">
            <Label className="text-xs">Font Weight</Label>
            <Select 
              value={style.fontWeight} 
              onValueChange={(value) => 
                updateStyle({ fontWeight: value as SubtitleStyle['fontWeight'] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* 텍스트 색상 */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Palette className="w-3 h-3" />
              Text Color
            </Label>
            <div className="flex gap-2">
              <input
                type="color"
                value={style.color}
                onChange={(e) => handleColorChange('color', e.target.value)}
                className="h-8 w-16 rounded border cursor-pointer"
              />
              <Select 
                value={style.color}
                onValueChange={(value) => handleColorChange('color', value)}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="#FFFFFF">White</SelectItem>
                  <SelectItem value="#FFFF00">Yellow</SelectItem>
                  <SelectItem value="#00FF00">Green</SelectItem>
                  <SelectItem value="#00FFFF">Cyan</SelectItem>
                  <SelectItem value="#FF00FF">Magenta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 배경 색상 */}
          <div className="space-y-2">
            <Label className="text-xs">Background Color</Label>
            <div className="flex gap-2">
              <input
                type="color"
                value={style.backgroundColor}
                onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
                className="h-8 w-16 rounded border cursor-pointer"
              />
              <Select 
                value={style.backgroundColor}
                onValueChange={(value) => handleColorChange('backgroundColor', value)}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="#000000">Black</SelectItem>
                  <SelectItem value="#333333">Dark Gray</SelectItem>
                  <SelectItem value="#666666">Gray</SelectItem>
                  <SelectItem value="transparent">Transparent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 배경 투명도 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Background Opacity</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(style.backgroundOpacity * 100)}%
              </span>
            </div>
            <Slider
              value={[style.backgroundOpacity]}
              onValueChange={handleOpacityChange}
              min={0}
              max={1}
              step={0.1}
              className="w-full"
            />
          </div>
          
          {/* 텍스트 테두리 */}
          <div className="space-y-2">
            <Label className="text-xs">Edge Style</Label>
            <Select 
              value={style.edgeStyle}
              onValueChange={(value) => 
                updateStyle({ edgeStyle: value as SubtitleStyle['edgeStyle'] })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="dropshadow">Drop Shadow</SelectItem>
                <SelectItem value="raised">Raised</SelectItem>
                <SelectItem value="depressed">Depressed</SelectItem>
                <SelectItem value="uniform">Uniform</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* 리셋 버튼 */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              // 기본 스타일로 리셋
              updateStyle({
                fontFamily: 'Arial, sans-serif',
                fontSize: 'medium',
                fontWeight: 'normal',
                color: '#FFFFFF',
                backgroundColor: '#000000',
                backgroundOpacity: 0.7,
                edgeStyle: 'dropshadow',
                edgeColor: '#000000'
              });
            }}
          >
            Reset to Default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
});

SubtitleStyleSettings.displayName = 'SubtitleStyleSettings';
