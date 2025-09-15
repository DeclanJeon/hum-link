import React from "react";
import { createRoot } from "react-dom/client";
import { enableMapSet } from 'immer';
import App from "./App.tsx";
import "./index.css";

// immer의 MapSet 플러그인 활성화
enableMapSet();

createRoot(document.getElementById("root")!).render(<App />);
