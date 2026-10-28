import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./app-shell";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AppShell />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}
