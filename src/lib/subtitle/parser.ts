/**
 * @fileoverview 브라우저 호환 자막 파서
 * @module lib/subtitle/parser
 */

/**
 * 자막 노드 인터페이스
 */
export interface SubtitleNode {
    id: string;
    startTime: number; // ms
    endTime: number;   // ms
    text: string;
  }
  
  /**
   * SRT 파서 클래스
   */
  export class SRTParser {
    /**
     * SRT 파일 파싱
     * @param content - SRT 파일 내용
     * @returns 파싱된 자막 노드 배열
     */
    static parse(content: string): SubtitleNode[] {
      const nodes: SubtitleNode[] = [];
      const blocks = content.trim().split(/\n\s*\n/);
      
      for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 3) continue;
        
        // ID (숫자)
        const id = lines[0];
        
        // 시간 (00:00:00,000 --> 00:00:00,000)
        const timeMatch = lines[1].match(
          /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
        );
        
        if (!timeMatch) continue;
        
        const startTime = this.timeToMs(
          parseInt(timeMatch[1]),
          parseInt(timeMatch[2]),
          parseInt(timeMatch[3]),
          parseInt(timeMatch[4])
        );
        
        const endTime = this.timeToMs(
          parseInt(timeMatch[5]),
          parseInt(timeMatch[6]),
          parseInt(timeMatch[7]),
          parseInt(timeMatch[8])
        );
        
        // 텍스트 (나머지 줄들)
        const text = lines.slice(2).join('\n');
        
        nodes.push({
          id: `srt-${id}`,
          startTime,
          endTime,
          text
        });
      }
      
      return nodes;
    }
    
    /**
     * 시간을 밀리초로 변환
     */
    private static timeToMs(h: number, m: number, s: number, ms: number): number {
      return h * 3600000 + m * 60000 + s * 1000 + ms;
    }
    
    /**
     * 밀리초를 SRT 시간 형식으로 변환
     */
    static msToTime(ms: number): string {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const milliseconds = ms % 1000;
      
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
    }
    
    /**
     * 자막 노드를 SRT 형식으로 변환
     */
    static stringify(nodes: SubtitleNode[]): string {
      return nodes.map((node, index) => {
        return `${index + 1}\n${this.msToTime(node.startTime)} --> ${this.msToTime(node.endTime)}\n${node.text}`;
      }).join('\n\n');
    }
  }
  
  /**
   * WebVTT 파서 클래스
   */
  export class VTTParser {
    /**
     * WebVTT 파일 파싱
     * @param content - VTT 파일 내용
     * @returns 파싱된 자막 노드 배열
     */
    static parse(content: string): SubtitleNode[] {
      const nodes: SubtitleNode[] = [];
      
      // WEBVTT 헤더 제거
      const lines = content.replace(/^WEBVTT.*\n*/m, '').trim().split('\n');
      
      let i = 0;
      while (i < lines.length) {
        // 빈 줄 건너뛰기
        if (!lines[i].trim()) {
          i++;
          continue;
        }
        
        // ID 또는 시간 라인
        let idLine = '';
        let timeLine = '';
        
        if (lines[i].includes('-->')) {
          timeLine = lines[i];
        } else {
          idLine = lines[i];
          i++;
          if (i < lines.length) {
            timeLine = lines[i];
          }
        }
        
        // 시간 파싱
        const timeMatch = timeLine.match(
          /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/
        );
        
        if (!timeMatch) {
          i++;
          continue;
        }
        
        const startTime = this.timeToMs(
          parseInt(timeMatch[1]),
          parseInt(timeMatch[2]),
          parseInt(timeMatch[3]),
          parseInt(timeMatch[4])
        );
        
        const endTime = this.timeToMs(
          parseInt(timeMatch[5]),
          parseInt(timeMatch[6]),
          parseInt(timeMatch[7]),
          parseInt(timeMatch[8])
        );
        
        // 텍스트 수집
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i]);
          i++;
        }
        
        nodes.push({
          id: idLine || `vtt-${Date.now()}-${Math.random()}`,
          startTime,
          endTime,
          text: textLines.join('\n')
        });
      }
      
      return nodes;
    }
    
    /**
     * 시간을 밀리초로 변환
     */
    private static timeToMs(h: number, m: number, s: number, ms: number): number {
      return h * 3600000 + m * 60000 + s * 1000 + ms;
    }
    
    /**
     * 밀리초를 VTT 시간 형식으로 변환
     */
    static msToTime(ms: number): string {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const milliseconds = ms % 1000;
      
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }
    
    /**
     * 자막 노드를 WebVTT 형식으로 변환
     */
    static stringify(nodes: SubtitleNode[]): string {
      const vtt = ['WEBVTT\n'];
      
      nodes.forEach((node, index) => {
        vtt.push(`${index + 1}`);
        vtt.push(`${this.msToTime(node.startTime)} --> ${this.msToTime(node.endTime)}`);
        vtt.push(node.text);
        vtt.push('');
      });
      
      return vtt.join('\n');
    }
  }
  
  /**
   * 통합 자막 파서
   */
  export class SubtitleParser {
    /**
     * 자막 파일 파싱
     * @param content - 파일 내용
     * @param format - 파일 포맷
     * @returns 파싱된 자막 노드 배열
     */
    static parse(content: string, format?: string): SubtitleNode[] {
      // 포맷 자동 감지
      if (!format) {
        if (content.includes('WEBVTT')) {
          format = 'vtt';
        } else if (/^\d+\r?\n\d{2}:\d{2}/.test(content)) {
          format = 'srt';
        }
      }
      
      switch (format) {
        case 'vtt':
          return VTTParser.parse(content);
        case 'srt':
        default:
          return SRTParser.parse(content);
      }
    }
    
    /**
     * 자막 노드를 문자열로 변환
     * @param nodes - 자막 노드 배열
     * @param format - 출력 포맷
     * @returns 포맷된 자막 문자열
     */
    static stringify(nodes: SubtitleNode[], format: string): string {
      switch (format) {
        case 'vtt':
          return VTTParser.stringify(nodes);
        case 'srt':
        default:
          return SRTParser.stringify(nodes);
      }
    }
  }
  