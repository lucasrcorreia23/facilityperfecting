"use client";

import { useState } from "react";
import { cn } from "@/app/lib/cn";
import { AppHeader } from "./app-header";
import { Sidebar, MobileNav } from "./sidebar";

export function AppShell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-[100dvh]">
      <AppHeader email={email} onToggleSidebar={() => setCollapsed((c) => !c)} />
      <Sidebar collapsed={collapsed} />
      <MobileNav />
      <main
        className={cn(
          "pt-14 pb-20 transition-[padding] sm:pb-6",
          collapsed ? "sm:pl-[60px]" : "sm:pl-[220px]",
        )}
      >
        <div className="mx-auto max-w-6xl px-4 pt-[var(--page-content-pt-below-header)] sm:px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
