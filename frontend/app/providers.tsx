"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { AuthProvider } from "./context/AuthContext";
import { TooltipProvider } from "./components/ui/tooltip";
import { UploadProvider } from "./context/UploadContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthProvider>
        <TooltipProvider>
          <UploadProvider>{children}</UploadProvider>
        </TooltipProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
