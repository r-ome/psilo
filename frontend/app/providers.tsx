"use client";

import { ReactNode } from "react";
import { AuthProvider } from "./context/AuthContext";
import { TooltipProvider } from "./components/ui/tooltip";
import { UploadProvider } from "./context/UploadContext";
import { ThemeProvider } from "./components/theme-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <UploadProvider>{children}</UploadProvider>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
