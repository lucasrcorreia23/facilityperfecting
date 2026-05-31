"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RectangleStackIcon,
  LinkIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { RobotIcon } from "@/app/components/icons/robot-icon";
import { cn } from "@/app/lib/cn";

const ITEMS = [
  { href: "/criacao", label: "Criação", icon: RobotIcon },
  { href: "/biblioteca", label: "Biblioteca", icon: RectangleStackIcon },
  { href: "/conexoes", label: "Conexões", icon: LinkIcon },
  { href: "/config", label: "Config", icon: Cog6ToothIcon },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        "layer-shell fixed left-0 top-14 bottom-0 hidden border-r border-slate-200 bg-white transition-[width] sm:block",
        collapsed ? "w-[60px]" : "w-[220px]",
      )}
    >
      <nav className="flex flex-col gap-1 p-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800",
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Barra inferior mobile (a sidebar fica oculta em telas pequenas). */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="layer-header fixed bottom-0 left-0 right-0 grid grid-cols-4 border-t border-slate-200 bg-white sm:hidden">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              active ? "text-[var(--primary)]" : "text-slate-500",
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
