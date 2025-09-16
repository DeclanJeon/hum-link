**feat: WebRTC 기반 실시간 화상 통화 기능 핵심 로직 구현**

WebRTC를 이용한 1:1 화상 통화 기능의 핵심적인 부분을 구현합니다. 시그널링 서버 연결, Peer 생성 및 관리, 미디어 스트림 제어, 관련 상태 관리를 위한 기반을 마련했습니다.

**주요 변경 사항:**

*   **WebRTC 및 시그널링:**
    *   `simple-peer`와 `socket.io-client`를 도입하여 WebRTC 연결 및 시그널링 로직을 구현했습니다.
    *   `webrtc.ts`: `simple-peer`를 래핑하여 Peer 연결 생성, 이벤트 핸들링 등 WebRTC 관련 핵심 로직을 관리하는 서비스를 추가했습니다.
    *   `signaling.ts`: 소켓 통신을 통해 시그널링 서버와 메시지를 교환하는 로직을 구현했습니다.
    *   `useWebRTCStore.ts`: WebRTC 연결 상태, 미디어 스트림, Peer 객체 등을 `Zustand`를 사용하여 전역으로 관리하는 스토어를 추가했습니다.

*   **UI 컴포넌트 및 페이지:**
    *   `Room.tsx`: 화상 통화가 이루어지는 핵심 페이지로, 비디오/오디오 스트림을 표시하고 제어하는 UI를 구현했습니다.
    *   `Lobby.tsx`: 사용자가 통화에 참여하기 전 닉네임을 설정하고 미디어 장치를 선택하는 로비 페이지를 구현했습니다.
    *   `DeviceSelector.tsx`: 마이크, 카메라 등 미디어 입력 장치를 선택할 수 있는 컴포넌트를 추가했습니다.
    *   `ControlBar.tsx`: 통화 중 마이크/카메라 On/Off, 통화 종료 등의 제어 기능을 제공하는 UI 컴포넌트를 추가했습니다.

*   **상태 관리:**
    *   `Zustand`를 도입하여 전역 상태 관리 로직을 구현했습니다.
    *   `useLobbyStore`, `useLandingStore` 등 각 페이지 및 기능별 상태 관리를 위한 스토어를 추가하여 컴포넌트 간 데이터 흐름을 체계화했습니다.

*   **개발 환경 설정:**
    *   `vite.config.ts`: `simple-peer` 라이브러리의 의존성 최적화를 위해 `optimizeDeps` 설정을 추가했습니다.
    *   `tsconfig.json`: 개발 편의성을 위해 일부 TypeScript `strict` 옵션을 비활성화했습니다.