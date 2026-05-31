"use client";

import { Button as HeroButton, type ButtonProps } from "@heroui/react";
import { cn } from "@/app/lib/cn";

type Variant = "primary" | "secondary";

interface Props extends Omit<ButtonProps, "variant" | "color"> {
  variant?: Variant;
}

/**
 * Botão padrão do app. `primary` usa o gradiente da marca; `secondary` é
 * outline slate. Cantos rounded-sm (8px).
 */
export function Button({ variant = "primary", className, ...rest }: Props) {
  const base = "rounded-sm font-medium min-h-[44px] sm:min-h-[40px]";
  const styles =
    variant === "primary"
      ? "text-white shadow-[var(--shadow-sm)] bg-[image:var(--primary-gradient)] data-[hover=true]:opacity-95"
      : "bg-white text-slate-700 border border-slate-200 data-[hover=true]:bg-slate-50";

  return <HeroButton radius="sm" className={cn(base, styles, className)} {...rest} />;
}
