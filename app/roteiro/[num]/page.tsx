import { notFound } from "next/navigation";
import { getScript, scriptToText } from "@/app/lib/roleplay-scripts";
import { ScriptView } from "@/app/components/roleplay-script-view";
import { CopyScriptButton } from "@/app/components/copy-script-button";

export default async function RoteiroPage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  const script = getScript(num);
  if (!script) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Roteiro do vendedor
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-800">{script.title}</h1>
        </div>
        <CopyScriptButton text={scriptToText(script)} />
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Leia na ordem. Espere o agente responder entre uma fala e outra. Os trechos entre
        colchetes são instruções rápidas — não são para falar.
      </p>
      <ScriptView script={script} />
    </main>
  );
}
