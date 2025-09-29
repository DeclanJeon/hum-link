/**
 * ICE 후보 최적화 서비스
 */
import { toast } from 'sonner';

export interface IceCandidate {
  candidate: string;
  type: 'host' | 'srflx' | 'relay' | 'prflx';
  priority: number;
  protocol: 'udp' | 'tcp';
  address: string;
  port: number;
}

export class IceOptimizer {
  private static candidateStats = new Map<string, number>();
  
  /**
   * ICE 후보 파싱
   */
  static parseCandidate(candidateString: string): IceCandidate | null {
    const parts = candidateString.split(' ');
    if (parts.length < 8) return null;
    
    return {
      candidate: candidateString,
      type: parts[7] as any,
      priority: parseInt(parts[3]),
      protocol: parts[2] as any,
      address: parts[4],
      port: parseInt(parts[5])
    };
  }
  
  /**
   * 후보 필터링 및 정렬
   */
  static filterCandidates(candidates: RTCIceCandidate[]): RTCIceCandidate[] {
    const parsed = candidates
      .map(c => ({
        original: c,
        parsed: this.parseCandidate(c.candidate)
      }))
      .filter(item => item.parsed !== null);
    
    // IPv6 제거 (선택적)
    const filtered = parsed.filter(item => {
      const addr = item.parsed!.address;
      return !addr.includes(':') || addr === '::1'; // localhost IPv6는 허용
    });
    
    // 우선순위 정렬
    filtered.sort((a, b) => {
      const getPriority = (type: string) => {
        switch (type) {
          case 'relay': return 1;  // TURN 우선
          case 'srflx': return 2;  // STUN
          case 'prflx': return 3;  // Peer reflexive
          case 'host': return 4;   // 로컬
          default: return 5;
        }
      };
      
      return getPriority(a.parsed!.type) - getPriority(b.parsed!.type);
    });
    
    return filtered.map(item => item.original);
  }
  
  /**
   * TURN 연결성 테스트
   */
  static async testConnectivity(
    iceServers: RTCIceServer[]
  ): Promise<{
    hasRelay: boolean;
    candidateTypes: string[];
    latency: number;
  }> {
    const startTime = Date.now();
    const pc = new RTCPeerConnection({ iceServers });
    const gatheredCandidates: string[] = [];
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        
        const result = {
          hasRelay: gatheredCandidates.includes('relay'),
          candidateTypes: [...new Set(gatheredCandidates)],
          latency: Date.now() - startTime
        };
        
        // 통계 업데이트
        gatheredCandidates.forEach(type => {
          this.candidateStats.set(type, (this.candidateStats.get(type) || 0) + 1);
        });
        
        resolve(result);
      }, 10000); // 10초 타임아웃
      
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const parsed = this.parseCandidate(e.candidate.candidate);
          if (parsed) {
            gatheredCandidates.push(parsed.type);
            
            console.log(`[ICE] Gathered ${parsed.type} candidate:`, {
              protocol: parsed.protocol,
              address: parsed.address,
              port: parsed.port
            });
            
            // TURN 후보 발견시 조기 종료
            if (parsed.type === 'relay') {
              clearTimeout(timeout);
              pc.close();
              
              resolve({
                hasRelay: true,
                candidateTypes: [...new Set(gatheredCandidates)],
                latency: Date.now() - startTime
              });
            }
          }
        }
      };
      
      // ICE 수집 시작
      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });
  }
  
  /**
   * 최적 경로 선택
   */
  static async selectBestPath(
    iceServers: RTCIceServer[]
  ): Promise<RTCIceServer[]> {
    const result = await this.testConnectivity(iceServers);
    
    console.log('[ICE] Connectivity test result:', result);
    
    if (!result.hasRelay) {
      console.warn('[ICE] No TURN relay candidates found');
      toast.warning('Direct connection only - may have issues with strict NAT', {
        duration: 5000
      });
    } else {
      console.log('[ICE] TURN relay available');
      toast.success(`Connected via relay (${result.latency}ms)`, {
        duration: 2000
      });
    }
    
    return iceServers;
  }
  
  /**
   * 연결 통계 조회
   */
  static getStats() {
    const stats: any = {};
    this.candidateStats.forEach((count, type) => {
      stats[type] = count;
    });
    
    return {
      candidateTypes: stats,
      totalConnections: Array.from(this.candidateStats.values()).reduce((a, b) => a + b, 0)
    };
  }
  
  /**
   * 연결 품질 추정
   */
  static estimateQuality(stats: RTCStatsReport): {
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    details: {
      rtt?: number;
      jitter?: number;
      packetLoss?: number;
    };
  } {
    let rtt = 0;
    let jitter = 0;
    let packetsLost = 0;
    let packetsSent = 0;
    
    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        rtt = report.currentRoundTripTime || 0;
      }
      if (report.type === 'inbound-rtp') {
        jitter = report.jitter || 0;
        packetsLost += report.packetsLost || 0;
      }
      if (report.type === 'outbound-rtp') {
        packetsSent += report.packetsSent || 0;
      }
    });
    
    const packetLoss = packetsSent > 0 ? (packetsLost / packetsSent) * 100 : 0;
    
    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    
    if (rtt < 50 && packetLoss < 0.5) {
      quality = 'excellent';
    } else if (rtt < 150 && packetLoss < 2) {
      quality = 'good';
    } else if (rtt < 300 && packetLoss < 5) {
      quality = 'fair';
    } else {
      quality = 'poor';
    }
    
    return {
      quality,
      details: {
        rtt: rtt * 1000, // ms
        jitter: jitter * 1000, // ms
        packetLoss
      }
    };
  }
}