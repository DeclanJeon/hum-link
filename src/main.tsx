import React from "react";
import { createRoot } from "react-dom/client";
import { enableMapSet } from 'immer';
import App from "./App.tsx";
import "./index.css";
import "./config"; // Import config to run validation at startup

// immer MapSet 지원 활성화
enableMapSet();

createRoot(document.getElementById("root")!).render(<App />);