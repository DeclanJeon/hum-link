import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import NotFound from "./pages/NotFound";
import { GlobalConnectionStatus } from "./components/GlobalConnectionStatus";
import { EnvError } from "./config"; // 환경 변수 에러를 가져옵니다.

const queryClient = new QueryClient();

// 환경 변수 에러가 있을 경우, 사용자에게 안내 메시지를 보여주는 컴포넌트
const EnvErrorDisplay = () => (
  <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground">
    <div className="rounded-lg border border-destructive bg-card p-8 text-center shadow-lg">
      <h1 className="mb-4 text-2xl font-bold text-destructive">Configuration Error</h1>
      <p className="mb-2">The application cannot start due to an invalid configuration.</p>
      <p className="text-muted-foreground">Please check the `.env` file for the following variable:</p>
      <code className="mt-4 inline-block rounded bg-muted px-2 py-1 font-mono text-sm">
        VITE_SIGNALING_SERVER_URL
      </code>
      <p className="mt-2 text-xs text-muted-foreground">It must be a valid URL.</p>
    </div>
  </div>
);


const App = () => {
  // 앱 렌더링 전에 환경 변수 에러를 확인합니다.
  if (EnvError) {
    return <EnvErrorDisplay />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* <GlobalConnectionStatus /> */}
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/lobby/:roomTitle" element={<Lobby />} />
            <Route path="/room/:roomTitle" element={<Room />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
