/**
 * Como a conta de destino aparece no texto: nome, ambiente, motivo de bloqueio e
 * o resumo "para onde vai" das confirmações de envio. Regra única para todas as
 * telas — antes cada seletor montava o próprio rótulo, com o ambiente cru ("prod").
 */

/** Só o que estas regras leem — serve `Connection` e o recorte que vem no rascunho. */
export interface ConnectionLike {
  id?: string;
  environment?: string | null;
  org_id?: number | null;
  org_name?: string | null;
  target_user_id?: number | null;
}

export type EnvironmentKind = "prod" | "hml" | "other";

export function environmentKind(environment: string | null | undefined): EnvironmentKind {
  const env = (environment ?? "").trim().toLowerCase();
  if (env === "prod" || env === "production" || env === "producao" || env === "produção") return "prod";
  if (env === "hml" || env === "homolog" || env === "homologacao" || env === "staging") return "hml";
  return "other";
}

export const isProduction = (connection: ConnectionLike | null | undefined): boolean =>
  environmentKind(connection?.environment) === "prod";

/** "Produção" · "Homolog" — ambiente desconhecido aparece como veio, nunca some. */
export function environmentLabel(environment: string | null | undefined): string {
  const kind = environmentKind(environment);
  if (kind === "prod") return "Produção";
  if (kind === "hml") return "Homolog";
  return (environment ?? "").trim() || "Ambiente desconhecido";
}

export function connectionName(connection: ConnectionLike | null | undefined): string {
  const name = connection?.org_name?.trim();
  if (name) return name;
  return connection?.org_id != null ? `Org ${connection.org_id}` : "Conta sem nome";
}

/** Item de lista: "Org X · Produção". */
export function connectionLabel(connection: ConnectionLike): string {
  return `${connectionName(connection)} · ${environmentLabel(connection.environment)}`;
}

/** Destino de um envio, com o ambiente na frente: "Produção · Org X". */
export function destinationLabel(connection: ConnectionLike | null | undefined): string {
  if (!connection) return "Conta não escolhida";
  return `${environmentLabel(connection.environment)} · ${connectionName(connection)}`;
}

/**
 * Por que a conta não pode receber envio (null = pode). Sem gestor, a Perfecting
 * não tem em nome de quem criar e todo envio volta 400.
 */
export function connectionBlockReason(connection: ConnectionLike): string | null {
  if (connection.target_user_id == null) {
    return "Sem gestor na conta — não dá para enviar. Sincronize em Contas.";
  }
  return null;
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** A busca casa nome, id da org e ambiente ("prod", "produção", "homolog"). */
export function matchesConnectionQuery(connection: ConnectionLike, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const haystack = fold(
    [
      connectionName(connection),
      connection.org_id != null ? String(connection.org_id) : "",
      connection.environment ?? "",
      environmentLabel(connection.environment),
    ].join(" "),
  );
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/**
 * Filtra pela busca, mas nunca tira a conta já escolhida: fora da lista, o
 * seletor deixaria de mostrar o valor.
 */
export function filterConnections<T extends ConnectionLike>(
  connections: T[],
  query: string,
  keepId?: string | null,
): T[] {
  return connections.filter((c) => (keepId && c.id === keepId) || matchesConnectionQuery(c, query));
}

/** A partir de quantas contas o seletor ganha campo de busca. */
export const CONNECTION_SEARCH_THRESHOLD = 8;

export interface DestinationGroup {
  /** "Produção · Org X" */
  label: string;
  count: number;
  production: boolean;
}

/**
 * Agrupa um lote pelo destino de cada item ("3 → Produção · X, 2 → Homolog · Y").
 * Produção vem primeiro: é a linha que não pode passar despercebida.
 */
export function summarizeDestinations(
  connections: Array<ConnectionLike | null | undefined>,
): DestinationGroup[] {
  const groups = new Map<string, DestinationGroup>();
  for (const connection of connections) {
    const label = destinationLabel(connection);
    const group = groups.get(label);
    if (group) group.count += 1;
    else groups.set(label, { label, count: 1, production: isProduction(connection) });
  }
  return Array.from(groups.values()).sort(
    (a, b) => Number(b.production) - Number(a.production) || a.label.localeCompare(b.label, "pt-BR"),
  );
}

/** "1 roleplay" / "3 roleplays" — a quantidade que a confirmação nomeia. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
