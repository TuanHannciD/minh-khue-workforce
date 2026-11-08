import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./app-shell";
import { AttendancePreview } from "@/features/attendance/index";
import { Providers } from "./providers";

function SessionApp() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/preview/attendance" element={<AttendancePreview />} />
        <Route path="/login" element={<SessionApp />} />
        <Route path="*" element={<SessionApp />} />
      </Routes>
    </BrowserRouter>
  );
}
