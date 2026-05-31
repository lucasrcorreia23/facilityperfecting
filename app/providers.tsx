"use client";

import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { useRouter } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <HeroUIProvider navigate={(href) => router.push(href)}>
      <ToastProvider placement="top-center" toastOffset={16} />
      {children}
    </HeroUIProvider>
  );
}
