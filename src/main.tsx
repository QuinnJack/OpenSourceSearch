import "@/shared/styles/globals.css";

import App from "@/app/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CORS_PROXY_ORIGIN } from "@/shared/constants/network";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

if (typeof window !== "undefined" && !window.__CORS_PROXY_ORIGIN) {
    window.__CORS_PROXY_ORIGIN = CORS_PROXY_ORIGIN;
}
