/**
 * @fileoverview 자막 파싱 Web Worker
 * @module workers/subtitle
 */

/// <reference lib="webworker" />

// subtitle 라이브러리 import 제거
// import { parseSync, stringifySync } from 'subtitle';

// 커스텀 파서 import
import { SubtitleParser, SubtitleNode } from '@/lib/subtitle/parser';

/**
 * 자막 큐 인터페이스
 */
interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  style?: Record<string, any>;
}

/**
 * 자막 트랙 인터페이스
 */
interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  cues: SubtitleCue[];
  format: string;
}

/**
 * Worker 메시지 타입
 */
type WorkerMessage = 
  | { type: 'parse'; file: File }
  | { type: 'convert'; text: string; format: string }
  | { type: 'validate'; file: File };

/**
 * 자막 파싱 Worker 클래스
 */
class SubtitleWorker {
  /**
   * Worker 초기화
   */
  constructor() {
    self.onmessage = this.handleMessage.bind(this);
  }

  /**
   * 메시지 처리
   * @param event - 메시지 이벤트
   */
  private async handleMessage(event: MessageEvent<WorkerMessage>): Promise<void> {
    const { type } = event.data;
    
    try {
      switch (type) {
        case 'parse':
          await this.parseSubtitle(event.data.file);
          break;
          
        case 'convert':
          await this.convertFormat(event.data.text, event.data.format);
          break;
          
        case 'validate':
          await this.validateSubtitle(event.data.file);
          break;
          
        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error) {
      self.postMessage({
        type: 'error',
        payload: { error: (error as Error).message }
      });
    }
  }

  /**
   * 자막 파일 파싱
   * @param file - 자막 파일
   */
  private async parseSubtitle(file: File): Promise<void> {
    try {
      const text = await file.text();
      const format = this.detectFormat(file.name, text);
      
      let cues: SubtitleCue[];
      
      if (format === 'ass' || format === 'ssa') {
        // ASS/SSA 특별 처리
        cues = await this.parseASS(text);
      } else {
        // 커스텀 파서 사용
        const parsed = SubtitleParser.parse(text, format);
        cues = parsed.map((node: SubtitleNode) => ({
          id: node.id,
          startTime: node.startTime,
          endTime: node.endTime,
          text: this.cleanText(node.text),
          style: {}
        }));
      }
      
      // 시간순 정렬
      cues.sort((a, b) => a.startTime - b.startTime);
      
      const track: SubtitleTrack = {
        id: `${file.name}-${Date.now()}`,
        label: this.extractLabel(file.name),
        language: this.detectLanguage(file.name),
        cues,
        format
      };
      
      self.postMessage({
        type: 'parsed',
        payload: { track }
      });
      
    } catch (error) {
      console.error('[SubtitleWorker] Parse error:', error);
      throw new Error(`Failed to parse subtitle: ${(error as Error).message}`);
    }
  }

  /**
   * 큐 정규화
   * @param cue - 원본 큐
   * @returns 정규화된 큐
   */
  private normalizeCue(cue: any): SubtitleCue {
    return {
      id: `cue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: cue.start,
      endTime: cue.end,
      text: this.cleanText(cue.text),
      style: cue.style || {}
    };
  }

  /**
   * ASS/SSA 파싱
   * @param text - ASS/SSA 텍스트
   * @returns 파싱된 큐 배열
   */
  private async parseASS(text: string): Promise<SubtitleCue[]> {
    const cues: SubtitleCue[] = [];
    const lines = text.split('\n');
    
    let inEvents = false;
    let formatLine: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('[Events]')) {
        inEvents = true;
        continue;
      }
      
      if (inEvents) {
        if (line.startsWith('Format:')) {
          formatLine = line.substring(7).split(',').map(s => s.trim());
        } else if (line.startsWith('Dialogue:')) {
          const parts = line.substring(9).split(',');
          const startIdx = formatLine.indexOf('Start');
          const endIdx = formatLine.indexOf('End');
          const textIdx = formatLine.indexOf('Text');
          
          if (startIdx !== -1 && endIdx !== -1 && textIdx !== -1) {
            cues.push({
              id: `cue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              startTime: this.parseASSTime(parts[startIdx]),
              endTime: this.parseASSTime(parts[endIdx]),
              text: this.cleanASSText(parts.slice(textIdx).join(',')),
              style: {}
            });
          }
        }
      }
    }
    
    return cues;
  }

  /**
   * ASS 시간 파싱
   * @param time - ASS 시간 문자열
   * @returns 밀리초
   */
  private parseASSTime(time: string): number {
    const parts = time.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  /**
   * ASS 텍스트 정리
   * @param text - 원본 텍스트
   * @returns 정리된 텍스트
   */
  private cleanASSText(text: string): string {
    // ASS 태그 제거
    return text
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n')
      .trim();
  }

  /**
   * 텍스트 정리
   * @param text - 원본 텍스트
   * @returns 정리된 텍스트
   */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // HTML 태그 제거
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  /**
   * 포맷 감지
   * @param filename - 파일명
   * @param content - 파일 내용
   * @returns 포맷 문자열
   */
  private detectFormat(filename: string, content: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    if (ext === 'ass' || ext === 'ssa') return ext;
    if (ext === 'vtt' || content.includes('WEBVTT')) return 'vtt';
    if (ext === 'srt' || /^\d+\r?\n\d{2}:\d{2}/.test(content)) return 'srt';
    
    return 'srt'; // 기본값
  }

  /**
   * 언어 감지
   * @param filename - 파일명
   * @returns ISO 639-1 언어 코드
   */
  private detectLanguage(filename: string): string {
    // 파일명에서 언어 코드 추출 (예: movie.ko.srt, movie.en.srt)
    const match = filename.match(/\.([a-z]{2})(?:\.[^.]+)?$/i);
    return match ? match[1].toLowerCase() : 'en';
  }

  /**
   * 파일명에서 레이블 추출
   * @param filename - 파일명
   * @returns 레이블
   */
  private extractLabel(filename: string): string {
    return filename.replace(/\.[^/.]+$/, '');
  }

  /**
   * 포맷 변환
   * @param text - 원본 텍스트
   * @param targetFormat - 대상 포맷
   */
  private async convertFormat(text: string, targetFormat: string): Promise<void> {
    try {
      // 커스텀 파서 사용 - 먼저 기존 포맷으로 파싱 후 대상 포맷으로 변환
      const detectedFormat = this.detectFormat('temp.' + targetFormat, text);
      const parsed = SubtitleParser.parse(text, detectedFormat);
      const converted = SubtitleParser.stringify(parsed, targetFormat);
      
      self.postMessage({
        type: 'converted',
        payload: { text: converted }
      });
    } catch (error) {
      throw new Error(`Format conversion failed: ${(error as Error).message}`);
    }
  }

  /**
   * 자막 파일 검증
   * @param file - 검증할 파일
   */
  private async validateSubtitle(file: File): Promise<void> {
    try {
      const text = await file.text();
      const format = this.detectFormat(file.name, text);
      const parsed = SubtitleParser.parse(text, format);
      
      self.postMessage({
        type: 'validated',
        payload: {
          valid: true,
          cueCount: parsed.length
        }
      });
    } catch (error) {
      self.postMessage({
        type: 'validated',
        payload: { valid: false, error: (error as Error).message }
      });
    }
  }
  
  /**
   * 포맷 정규화
   * @param format - 원본 포맷
   * @returns 정규화된 포맷 ('SRT' | 'WebVTT')
   */
  private normalizeFormat(format: string): 'SRT' | 'WebVTT' {
    const normalized = format.toUpperCase();
    if (normalized === 'SRT' || normalized === 'SUBRIP') {
      return 'SRT';
    }
    if (normalized === 'VTT' || normalized === 'WEBVTT' || normalized === 'WEB-VTT') {
      return 'WebVTT';
    }
    // 기본값으로 SRT 반환
    return 'SRT';
  }
}

// Worker 인스턴스 생성
new SubtitleWorker();
