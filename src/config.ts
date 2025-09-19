import { z } from 'zod';

const envSchema = z.object({
  VITE_SIGNALING_SERVER_URL: z.string().url({ message: "Invalid signaling server URL in .env file" }),
});

// 애플리케이션 시작 시 환경 변수를 파싱하고 검증합니다.
// 만약 유효하지 않으면 즉시 에러를 발생시켜 문제를 조기에 발견할 수 있습니다.
export const ENV = envSchema.parse(import.meta.env);