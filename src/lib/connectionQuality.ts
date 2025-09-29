import { useSignalingStore } from "@/stores/useSignalingStore";

/**
 * WebRTC 연결 품질 모니터링
 */
export class ConnectionQualityMonitor {
    static async checkTurnConnectivity(): Promise<{
      hasRelay: boolean;
      candidateTypes: string[];
      latency?: number;
    }> {
      const { iceServers } = useSignalingStore.getState();
      
      if (!iceServers) {
        console.warn('[Monitor] ICE 서버 설정 없음');
        return { hasRelay: false, candidateTypes: [] };
      }
      
      const pc = new RTCPeerConnection({ iceServers });
      const candidates: string[] = [];
      
      return new Promise((resolve) => {
        const startTime = Date.now();
        
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            const type = this.getCandidateType(e.candidate.candidate);
            candidates.push(type);
            
            if (type === 'relay') {
              console.log('[Monitor] ✅ TURN 서버 연결 성공!');
            }
          } else {
            // ICE 수집 완료
            const hasRelay = candidates.includes('relay');
            const latency = Date.now() - startTime;
            
            pc.close();
            resolve({ hasRelay, candidateTypes: [...new Set(candidates)], latency });
          }
        };
        
        // 더미 데이터 채널로 ICE 수집 시작
        pc.createDataChannel('test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        // 타임아웃
        setTimeout(() => {
          pc.close();
          resolve({ 
            hasRelay: candidates.includes('relay'), 
            candidateTypes: [...new Set(candidates)] 
          });
        }, 10000);
      });
    }
    
    private static getCandidateType(candidate: string): string {
      if (candidate.includes('typ relay')) return 'relay';
      if (candidate.includes('typ srflx')) return 'srflx';
      if (candidate.includes('typ host')) return 'host';
      return 'unknown';
    }
  }