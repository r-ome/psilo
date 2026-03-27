"use client";

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/app/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { UploadProgressIndicator } from "./UploadProgressIndicator";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-6 md:hidden">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <UploadProgressIndicator />
    </SidebarProvider>
  );
}
