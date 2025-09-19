import { z } from 'zod';

const envSchema = z.object({
  VITE_SIGNALING_SERVER_URL: z.string().url({ message: "Invalid signaling server URL in .env file" }),
});

let ENV_VARS: z.infer<typeof envSchema>;
let ENV_ERROR: z.ZodError | null = null;

try {
  // 앱 시작 시 환경 변수를 파싱하고 유효성을 검사합니다.
  ENV_VARS = envSchema.parse(import.meta.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    // 유효성 검사 실패 시 에러를 저장합니다.
    // 이 에러는 App.tsx에서 앱을 렌더링하기 전에 확인됩니다.
    ENV_ERROR = error;
    console.error("❌ Invalid environment variables:", error.flatten().fieldErrors);
  } else {
    // 예기치 않은 다른 에러 처리
    console.error("❌ An unexpected error occurred while parsing environment variables:", error);
    ENV_ERROR = new z.ZodError([]); // 기본 에러 객체 생성
  }
}

// @ts-ignore: ENV_VARS는 try 블록에서 초기화되지만, 에러 발생 시를 대비해 ignore 처리합니다.
export const ENV = ENV_VARS;
export const EnvError = ENV_ERROR;