import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/app/app-shell";
import { Providers } from "@/app/providers";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
  <StrictMode>
    <Providers>
      <AppShell />
    </Providers>
  </StrictMode>,
);
