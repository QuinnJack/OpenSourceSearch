import "@/shared/styles/globals.css";
import "node_modules/react-grid-layout/css/styles.css";
import "node_modules/react-resizable/css/styles.css";

import App from "@/app/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
