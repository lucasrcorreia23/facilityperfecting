"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const CLS =
  "inline-flex items-center justify-center w-11 h-11 rounded-sm border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800";

/** Botão de voltar 44×44 outline (padrão único). */
export function BackButton({ href }: { href?: string }) {
  const router = useRouter();
  if (href) {
    return (
      <Link href={href} aria-label="Voltar" className={CLS}>
        <ArrowLeftIcon className="w-5 h-5" />
      </Link>
    );
  }
  return (
    <button type="button" aria-label="Voltar" className={CLS} onClick={() => router.back()}>
      <ArrowLeftIcon className="w-5 h-5" />
    </button>
  );
}
