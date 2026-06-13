import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { resolveRoteiro, scriptToText } from "@/app/lib/roleplay-scripts";
import { ScriptView } from "@/app/components/roleplay-script-view";
import { CopyScriptButton } from "@/app/components/copy-script-button";

export default async function RoteiroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("roleplay_readiness")
    .select("name, roteiro")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) notFound();

  const { title, body } = resolveRoteiro(row.name, row.roteiro);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Roteiro do vendedor
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-800">{title}</h1>
        </div>
        {body && <CopyScriptButton text={scriptToText(title, body)} />}
      </div>
      {body ? (
        <ScriptView markdown={body} />
      ) : (
        <p className="text-sm text-slate-500">Este roleplay ainda não tem roteiro.</p>
      )}
    </main>
  );
}
