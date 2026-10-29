// Pure game rules for "Rei da Quadra". No I/O: the server validates and persists.

export type Side = "A" | "B";

export interface CourtState {
  teamA: string[];
  teamB: string[];
  reserve: string[];
}

export interface MatchRecord {
  matchNumber: number;
  teamA: string[];
  teamB: string[];
  winnerSide: Side;
}

const randomUnit = () => {
  try {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  } catch {
    return Math.random();
  }
};
const randomInt = (max: number) => Math.floor(randomUnit() * max);

export function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function normalizeName(name: string) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

export function nameKey(name: string) {
  return normalizeName(name).toLocaleLowerCase("pt-BR");
}

/** Split a pasted list (lines, commas, semicolons) into unique names. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text || "").split(/[\n,;]+/)) {
    const name = normalizeName(raw);
    if (!name) continue;
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Initial court: 4 starters split into two pairs; remaining players shuffled into the reserve. */
export function drawInitial(ids: string[], starters?: string[]): CourtState {
  if (new Set(ids).size !== ids.length) throw new Error("Há participantes duplicados.");
  if (ids.length < 4) throw new Error("Adicione pelo menos quatro jogadores para começar.");
  const chosen = starters ?? shuffle(ids).slice(0, 4);
  if (chosen.length !== 4 || new Set(chosen).size !== 4 || chosen.some((id) => !ids.includes(id))) {
    throw new Error("Selecione exatamente quatro jogadores para começar.");
  }
  const court = shuffle(chosen);
  return {
    teamA: court.slice(0, 2),
    teamB: court.slice(2, 4),
    reserve: shuffle(ids.filter((id) => !chosen.includes(id))),
  };
}

/** Winners stay; losers go to the end of the reserve; two challengers come in. */
export function rotate(state: CourtState, loserSide: Side, entrants: string[]): CourtState {
  const winnerSide: Side = loserSide === "A" ? "B" : "A";
  const winner = winnerSide === "A" ? state.teamA : state.teamB;
  const loser = loserSide === "A" ? state.teamA : state.teamB;
  const pool = state.reserve.concat(loser);
  if (entrants.length !== 2 || new Set(entrants).size !== 2) throw new Error("Escolha dois desafiantes distintos.");
  if (!entrants.every((id) => pool.includes(id))) throw new Error("Os desafiantes precisam estar na reserva.");
  const next: CourtState = {
    teamA: winnerSide === "A" ? winner.slice() : entrants.slice(),
    teamB: winnerSide === "B" ? winner.slice() : entrants.slice(),
    reserve: pool.filter((id) => !entrants.includes(id)),
  };
  validateCourt(next, [...state.teamA, ...state.teamB, ...state.reserve]);
  return next;
}

export function validateCourt(state: CourtState, participants: string[]) {
  const court = [...state.teamA, ...state.teamB];
  if (participants.length < 4) throw new Error("São necessários pelo menos quatro participantes ativos.");
  if (court.length !== 4 || new Set(court).size !== 4) throw new Error("A quadra precisa ter quatro jogadores distintos.");
  if (new Set(state.reserve).size !== state.reserve.length) throw new Error("Há jogadores duplicados na reserva.");
  if (court.some((id) => state.reserve.includes(id))) throw new Error("Um jogador não pode estar na quadra e na reserva.");
  const all = new Set([...court, ...state.reserve]);
  if (all.size !== participants.length || participants.some((id) => !all.has(id))) {
    throw new Error("A quadra e a reserva não correspondem aos participantes.");
  }
}

const pairKey = (pair: string[]) => pair.slice().sort().join("|");

function comboScore(pair: string[], winner: string[], history: MatchRecord[], avoidRematches: boolean) {
  if (!avoidRematches || history.length === 0) return 0;
  let score = 0;
  const candidate = pairKey(pair);
  const recent = history.slice(-5).reverse();
  recent.forEach((record, index) => {
    const decay = Math.max(1, 5 - index);
    if (pairKey(record.teamA) === candidate || pairKey(record.teamB) === candidate) score -= decay * 5;
    const opponents = pair.every((id) => record.teamA.includes(id))
      ? record.teamB
      : pair.every((id) => record.teamB.includes(id))
        ? record.teamA
        : null;
    if (opponents && pairKey(opponents) === pairKey(winner)) score -= decay * 3;
    const overlap = pair.filter((id) => record.teamA.includes(id) || record.teamB.includes(id)).length;
    score -= overlap * 0.15;
  });
  return score;
}

/** Pick the next two challengers, preferring partner/opponent variety when enabled. */
export function chooseEntrants(
  state: CourtState,
  loserSide: Side,
  history: MatchRecord[],
  avoidRematches: boolean,
  manual?: string[] | null,
): string[] {
  const winner = loserSide === "A" ? state.teamB : state.teamA;
  const loser = loserSide === "A" ? state.teamA : state.teamB;
  if (manual && manual.length === 2 && manual.every((id) => state.reserve.includes(id))) return manual.slice();
  const pool = state.reserve.concat(loser);
  if (pool.length < 2) return [];
  const candidates: { pair: string[]; score: number }[] = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const pair = [pool[i], pool[j]];
      candidates.push({ pair, score: comboScore(pair, winner, history, avoidRematches) + randomUnit() * 1.25 });
    }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0].score;
  const top = candidates.filter((c) => best - c.score < 0.45);
  return top[randomInt(top.length)].pair;
}

export interface PlayerStat {
  id: string;
  played: number;
  wins: number;
  losses: number;
  stays: number;
}

/** Stats come only from recorded matches (sorted by match number). */
export function calculateStats(history: MatchRecord[]): PlayerStat[] {
  const sorted = history.slice().sort((a, b) => a.matchNumber - b.matchNumber);
  const map = new Map<string, PlayerStat>();
  sorted.forEach((record, index) => {
    const winners = record.winnerSide === "A" ? record.teamA : record.teamB;
    for (const id of [...record.teamA, ...record.teamB]) {
      const stat = map.get(id) ?? { id, played: 0, wins: 0, losses: 0, stays: 0 };
      stat.played++;
      if (winners.includes(id)) {
        stat.wins++;
        if (index < sorted.length - 1) stat.stays++;
      } else stat.losses++;
      map.set(id, stat);
    }
  });
  return Array.from(map.values()).sort((a, b) => b.wins - a.wins || b.played - a.played);
}

export function moveInList<T>(list: T[], index: number, delta: number): T[] {
  const next = index + delta;
  if (index < 0 || next < 0 || next >= list.length) return list.slice();
  const out = list.slice();
  [out[index], out[next]] = [out[next], out[index]];
  return out;
}

// ---------- Local backup (legacy localStorage format v1) ----------

export interface BackupPreview {
  players: number;
  sessions: number;
  matches: number;
  sessionNames: string[];
}

interface LegacySession {
  id: string;
  name: string;
  status?: string;
  participants: { id: string; name: string; active?: boolean }[];
  teamA: string[];
  teamB: string[];
  reserve: string[];
  history?: { matchNumber: number; teamA: string[]; teamB: string[]; winnerSide: Side }[];
}

/** Validate a legacy backup file before sending it to the server. Throws a readable error. */
export function previewBackup(data: unknown): BackupPreview {
  const d = data as { players?: unknown; sessions?: unknown };
  if (!d || !Array.isArray(d.players) || !Array.isArray(d.sessions)) throw new Error("Formato de backup inválido.");
  const sessions = d.sessions as LegacySession[];
  let matches = 0;
  for (const s of sessions) {
    if (!s || typeof s.name !== "string" || !Array.isArray(s.participants)) throw new Error("Sessão inválida no backup.");
    const ids = s.participants.filter((p) => p.active !== false).map((p) => p.id);
    if (s.participants.some((p) => !normalizeName(p.name))) throw new Error(`Participante sem nome em "${s.name}".`);
    if (s.status !== "finished") {
      try {
        validateCourt({ teamA: s.teamA ?? [], teamB: s.teamB ?? [], reserve: s.reserve ?? [] }, ids);
      } catch (error) {
        throw new Error(`Sessão "${s.name}" inconsistente: ${(error as Error).message}`);
      }
    }
    const history = s.history ?? [];
    const numbers = new Set(history.map((h) => h.matchNumber));
    if (numbers.size !== history.length) throw new Error(`Partidas duplicadas em "${s.name}".`);
    for (const h of history) {
      if (h.teamA?.length !== 2 || h.teamB?.length !== 2 || (h.winnerSide !== "A" && h.winnerSide !== "B")) {
        throw new Error(`Partida inválida em "${s.name}".`);
      }
    }
    matches += history.length;
  }
  for (const p of d.players as { name?: string }[]) {
    if (!p || !normalizeName(p.name ?? "")) throw new Error("Jogador sem nome no backup.");
  }
  return { players: d.players.length, sessions: sessions.length, matches, sessionNames: sessions.map((s) => s.name) };
}

export function csvEscape(value: unknown) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}
