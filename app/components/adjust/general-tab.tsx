"use client";

import { Input, Select, SelectItem } from "@heroui/react";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import { TabIntro, fieldClassNames } from "@/app/components/adjust/ui";
import {
  type AdjustGeneral,
  DIFFICULTY_LEVELS,
  ROLE_PLAY_STATUSES,
} from "@/supabase/functions/_shared/roleplay-adjust-model";

const NO_STATUS = "__none__";

export function GeneralTab({
  value,
  onChange,
}: {
  value: AdjustGeneral;
  onChange: (next: AdjustGeneral) => void;
}) {
  return (
    <div>
      <TabIntro>Como o roleplay aparece no catálogo e em que nível ele roda.</TabIntro>

      <div className="flex flex-col gap-6">
        <Input
          label="Nome do treino"
          labelPlacement="outside"
          value={value.training_name}
          onValueChange={(v) => onChange({ ...value, training_name: v })}
          radius="sm"
          variant="bordered"
          classNames={fieldClassNames}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Quem vê"
            labelPlacement="outside-top"
            selectedKeys={[value.role_play_status_id == null ? NO_STATUS : String(value.role_play_status_id)]}
            onSelectionChange={(keys) => {
              const k = String(Array.from(keys)[0] ?? NO_STATUS);
              onChange({ ...value, role_play_status_id: k === NO_STATUS ? null : Number(k) });
            }}
            radius="sm"
            classNames={managerSelectClassNames}
          >
            {ROLE_PLAY_STATUSES.map((s) => (
              <SelectItem
                key={s.id == null ? NO_STATUS : String(s.id)}
                textValue={`${s.label} — ${s.hint}`}
                description={s.hint}
                classNames={selectItemClassNames}
              >
                {s.label}
              </SelectItem>
            ))}
          </Select>
          <Select
            label="Nível de dificuldade"
            labelPlacement="outside-top"
            selectedKeys={value.difficulty_level_id != null ? [String(value.difficulty_level_id)] : []}
            onSelectionChange={(keys) => {
              const k = Array.from(keys)[0];
              if (k) onChange({ ...value, difficulty_level_id: Number(k) });
            }}
            radius="sm"
            classNames={managerSelectClassNames}
          >
            {DIFFICULTY_LEVELS.map((d) => (
              <SelectItem key={String(d.id)} classNames={selectItemClassNames}>
                {d.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        <p className="text-xs text-slate-500">
          A chamada inteira sempre começa com o comprador atendendo (&quot;Bom dia, quem fala?&quot;). As falas de abertura
          que valem ficam em Conhecimento por bloco e são usadas quando o treino começa por aquele bloco.
        </p>
      </div>
    </div>
  );
}
