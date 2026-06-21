"use client";

import { useRouter } from "next/navigation";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { Bars3Icon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import { createClient } from "@/app/lib/supabase/client";
import {
  MENU_CONTENT_CLASSES,
  MENU_ITEM_HOVER_DANGER,
  MENU_TRIGGER_HOVER,
} from "@/app/lib/menu-hover-classes";

export function AppHeader({
  email,
  onToggleSidebar,
}: {
  email: string | null;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const initials = (email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="layer-header fixed inset-x-0 top-0 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Alternar menu"
          onClick={onToggleSidebar}
          className="hidden h-9 w-9 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-50 sm:inline-flex"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-slate-800">
          Gerador de Roleplays
        </span>
      </div>

      <Dropdown classNames={{ content: MENU_CONTENT_CLASSES }} placement="bottom-end">
        <DropdownTrigger>
          <button
            type="button"
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 ${MENU_TRIGGER_HOVER}`}
          >
            {initials}
          </button>
        </DropdownTrigger>
        <DropdownMenu aria-label="Conta" disabledKeys={["profile"]}>
          <DropdownItem
            key="profile"
            isReadOnly
            showDivider
            className="opacity-100"
            textValue={email ?? "Conta"}
          >
            <span className="block text-[11px] text-slate-400">Conectado como</span>
            <span className="block truncate text-sm font-medium text-slate-700">
              {email ?? "—"}
            </span>
          </DropdownItem>
          <DropdownItem
            key="logout"
            className={MENU_ITEM_HOVER_DANGER}
            startContent={<ArrowRightStartOnRectangleIcon className="w-4 h-4" />}
            onPress={logout}
          >
            Sair
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </header>
  );
}
