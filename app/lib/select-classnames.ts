import { MENU_CONTENT_CLASSES, MENU_ITEM_HOVER } from "./menu-hover-classes";

/**
 * classNames padrão para HeroUI <Select> — trigger e popover em rounded-sm (8px),
 * alinhados ao resto do sistema (espelha small-mvp/app/lib/manager-select-classnames.ts).
 */
export const managerSelectClassNames = {
  trigger:
    "bg-white border border-slate-200 rounded-sm data-[hover=true]:bg-slate-50 data-[focus=true]:border-slate-300 min-h-[44px] sm:min-h-[40px]",
  popoverContent: MENU_CONTENT_CLASSES,
  listbox: "p-0",
  listboxWrapper: "p-0",
  value: "text-sm text-slate-800",
} as const;

export const selectItemClassNames = {
  base: MENU_ITEM_HOVER,
} as const;
