// frontend/src/lib/translationService.ts

/**
 * @fileoverview 다중 번역 엔진 서비스 (MyMemory 우선, Google Translate fallback)
 * @module lib/translationService
 */

interface TranslationResult {
    text: string;
    engine: 'mymemory' | 'google' | 'none';
    error?: string;
  }
  
  /**
   * MyMemory API 응답 타입 정의
   */
  interface MyMemoryResponse {
    responseData: {
      translatedText: string;
      match: number;
    };
    quotaFinished: boolean;
    mtLangSupported: boolean | null;
    responseDetails: string;
    responseStatus: number;
    responderId: string | null;
    exception_code: string | null;
    matches: Array<{
      id: string;
      segment: string;
      translation: string;
      source: string;
      target: string;
      quality: number | string;
      reference: string | null;
      'usage-count': number;
      subject: string;
      'created-by': string;
      'last-updated-by': string;
      'create-date': string;
      'last-update-date': string;
      match: number;
      penalty: number;
    }>;
  }
  
  /**
   * MyMemory Translation API
   * 무료 API, 일일 제한: 5000 words/day
   */
  class MyMemoryTranslator {
    private readonly apiUrl = 'https://api.mymemory.translated.net/get';
    private readonly userAgent = import.meta.env.VITE_EMAIL;
    
    async translate(
      text: string, 
      sourceLang: string, 
      targetLang: string
    ): Promise<string> {
      if (!text.trim()) return '';
      
      // 텍스트 길이 제한 (500 bytes)
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      if (bytes.length > 500) {
        throw new Error('Text exceeds 500 bytes limit');
      }
      
      try {
        const params = new URLSearchParams({
          q: text,
          langpair: `${sourceLang}|${targetLang}`,
          de: this.userAgent,
          mt: '1'
        });
        
        const response = await fetch(`${this.apiUrl}?${params}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`MyMemory HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data: MyMemoryResponse = await response.json();
        
        // 쿼터 초과 체크
        if (data.quotaFinished) {
          throw new Error('MyMemory daily quota exceeded (5000 words/day)');
        }
        
        // 예외 코드 체크
        if (data.exception_code) {
          throw new Error(`MyMemory exception: ${data.exception_code}`);
        }
        
        // 403 에러 체크 (쿼터 초과)
        if (data.responseStatus === 403) {
          throw new Error('MyMemory daily limit exceeded');
        }
        
        // ✅ 핵심: translatedText만 있으면 OK (responseStatus 체크 제거)
        if (data.responseData?.translatedText) {
          const translated = data.responseData.translatedText.trim();
          
          if (!translated) {
            throw new Error('Empty translation received');
          }
          
          // 고품질 매치 우선 사용 (70% 이상)
          if (data.matches && data.matches.length > 0) {
            const bestMatch = data.matches[0];
            const quality = typeof bestMatch.quality === 'number' 
              ? bestMatch.quality 
              : parseFloat(String(bestMatch.quality));
            
            if (quality >= 70 && bestMatch.translation?.trim()) {
              console.log(`[MyMemory] Using high-quality match (${quality}%)`);
              return bestMatch.translation.trim();
            }
          }
          
          console.log(`[MyMemory] Translation successful (status: ${data.responseStatus})`);
          return translated;
        }
        
        // 에러 메시지
        const errorMsg = data.responseDetails || 'Unknown error';
        throw new Error(`MyMemory failed: ${errorMsg} (status: ${data.responseStatus})`);
        
      } catch (error) {
        if (error instanceof Error) {
          console.warn('[MyMemory] Translation failed:', error.message);
        } else {
          console.warn('[MyMemory] Translation failed:', error);
        }
        throw error;
      }
    }
  }
  
  /**
   * Google Translate Fallback
   */
  class GoogleTranslator {
    async translate(
      text: string, 
      sourceLang: string, 
      targetLang: string
    ): Promise<string> {
      if (!text.trim()) return '';
      
      try {
        const translate = (await import('translate')).default;
        translate.engine = 'google';
        
        const result = await translate(text, {
          from: sourceLang,
          to: targetLang
        });
        
        return result;
        
      } catch (error) {
        if (error instanceof Error) {
          console.warn('[Google] Translation failed:', error.message);
        } else {
          console.warn('[Google] Translation failed:', error);
        }
        throw error;
      }
    }
  }
  
  /**
   * 통합 번역 서비스
   * MyMemory 우선 → Google Translate fallback
   */
  export class TranslationService {
    private myMemory = new MyMemoryTranslator();
    private google = new GoogleTranslator();
    
    /**
     * 번역 실행 (자동 fallback)
     */
    async translate(
      text: string,
      sourceLang: string,
      targetLang: string
    ): Promise<TranslationResult> {
      if (!text.trim()) {
        return { text, engine: 'none' };
      }
      
      const normalizedSource = this.normalizeLanguageCode(sourceLang);
      const normalizedTarget = this.normalizeLanguageCode(targetLang);
      
      if (normalizedSource === normalizedTarget) {
        return { text, engine: 'none' };
      }
      
      // 1. MyMemory 시도
      try {
        const translated = await this.myMemory.translate(
          text, 
          normalizedSource, 
          normalizedTarget
        );
        console.log('[Translation] ✅ MyMemory success');
        return { text: translated, engine: 'mymemory' };
      } catch (myMemoryError) {
        const errorMsg = myMemoryError instanceof Error 
          ? myMemoryError.message 
          : String(myMemoryError);
        console.warn('[Translation] ⚠️ MyMemory failed, trying Google...', errorMsg);
      }
      
      // 2. Google Translate fallback
      try {
        const translated = await this.google.translate(
          text, 
          normalizedSource, 
          normalizedTarget
        );
        console.log('[Translation] ✅ Google Translate success');
        return { text: translated, engine: 'google' };
      } catch (googleError) {
        const errorMsg = googleError instanceof Error 
          ? googleError.message 
          : String(googleError);
        console.error('[Translation] ❌ All translation engines failed', errorMsg);
        
        return { 
          text, 
          engine: 'none', 
          error: 'Translation unavailable' 
        };
      }
    }
    
    /**
     * 언어 코드 정규화 (ISO 639-1)
     */
    normalizeLanguageCode(code: string): string {
      const normalized = code.split('-')[0].toLowerCase();
      
      // 특수 케이스 매핑
      const languageMap: Record<string, string> = {
        'zh': 'zh-CN',
        'zh-tw': 'zh-TW',
      };
      
      return languageMap[normalized] || normalized;
    }
  }
  
  // 싱글톤 인스턴스
  export const translationService = new TranslationService();