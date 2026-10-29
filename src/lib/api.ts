import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Side } from "@/lib/game";

export type Player = { id: string; name: string; created_at: string };
export type SessionRow = {
  id: string;
  name: string;
  status: "active" | "paused" | "finished";
  team_a: string[];
  team_b: string[];
  reserve: string[];
  next_entrants: string[] | null;
  match_no: number;
  created_at: string;
  updated_at: string;
};
export type Participant = { session_id: string; player_id: string; display_name: string; active: boolean; joined_at: string };
export type MatchRow = {
  id: string;
  session_id: string;
  match_number: number;
  played_at: string;
  team_a: string[];
  team_b: string[];
  winner_side: Side;
  entrants: string[];
  state_before: unknown;
};
export type Profile = { id: string; display_name: string | null; avoid_rematches: boolean; active_session_id: string | null };

/** Turn server errors ("CODE: mensagem") and network failures into readable Portuguese. */
export function friendlyError(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? String(error ?? "");
  if (/Failed to fetch|NetworkError|network|fetch failed|Load failed/i.test(raw) || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return "Sem conexão com o servidor. Nada foi salvo — verifique a internet e tente de novo.";
  }
  const m = raw.match(/^[A-Z_]+:\s*(.*)$/s);
  if (m) return m[1];
  if (/duplicate key|players_owner_name_uidx/i.test(raw)) return "Já existe um jogador com esse nome.";
  return raw || "Algo deu errado. Tente novamente.";
}

export function isConflict(error: unknown) {
  return /MATCH_CHANGED/.test((error as { message?: string })?.message ?? "");
}

async function unwrap<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// ---------- Queries ----------
export const keys = {
  profile: ["profile"] as const,
  players: ["players"] as const,
  sessions: ["sessions"] as const,
  participants: (id: string) => ["participants", id] as const,
  matches: (id: string) => ["matches", id] as const,
  allMatchesCount: ["matches-count"] as const,
  share: (id: string) => ["share", id] as const,
};

export const profileQuery = queryOptions({
  queryKey: keys.profile,
  queryFn: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre novamente.");
    const row = await unwrap(
      supabase.from("profiles").select("id, display_name, avoid_rematches, active_session_id").eq("id", auth.user.id).maybeSingle(),
    );
    return (row ?? { id: auth.user.id, display_name: null, avoid_rematches: true, active_session_id: null }) as Profile;
  },
});

export const playersQuery = queryOptions({
  queryKey: keys.players,
  queryFn: async () =>
    (await unwrap(
      supabase.from("players").select("id, name, created_at").is("archived_at", null).order("name"),
    )) as Player[],
});

export const sessionsQuery = queryOptions({
  queryKey: keys.sessions,
  queryFn: async () =>
    (await unwrap(
      supabase
        .from("sessions")
        .select("id, name, status, team_a, team_b, reserve, next_entrants, match_no, created_at, updated_at")
        .order("updated_at", { ascending: false }),
    )) as SessionRow[],
});

export const participantsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: keys.participants(sessionId),
    queryFn: async () =>
      (await unwrap(
        supabase
          .from("session_participants")
          .select("session_id, player_id, display_name, active, joined_at")
          .eq("session_id", sessionId)
          .order("joined_at"),
      )) as Participant[],
  });

export const matchesQuery = (sessionId: string) =>
  queryOptions({
    queryKey: keys.matches(sessionId),
    queryFn: async () =>
      (await unwrap(
        supabase
          .from("matches")
          .select("id, session_id, match_number, played_at, team_a, team_b, winner_side, entrants, state_before")
          .eq("session_id", sessionId)
          .order("match_number", { ascending: true }),
      )) as MatchRow[],
  });

export const matchesCountQuery = queryOptions({
  queryKey: keys.allMatchesCount,
  queryFn: async () => {
    const { count, error } = await supabase.from("matches").select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  },
});

export const shareQuery = (sessionId: string) =>
  queryOptions({
    queryKey: keys.share(sessionId),
    queryFn: async () => {
      const rows = await unwrap(
        supabase.from("share_tokens").select("token, created_at").eq("session_id", sessionId).is("revoked_at", null).limit(1),
      );
      return (rows?.[0] as { token: string; created_at: string } | undefined) ?? null;
    },
  });

// ---------- Mutations (each waits for server confirmation) ----------
export const api = {
  createPlayer: async (name: string) =>
    (await unwrap(supabase.from("players").insert({ name }).select("id, name, created_at").single())) as Player,
  renamePlayer: (id: string, name: string) => unwrap(supabase.rpc("rename_player", { p_player_id: id, p_name: name })),
  archivePlayer: (id: string) => unwrap(supabase.rpc("archive_player", { p_player_id: id })),
  createSession: (name: string, teamA: string[], teamB: string[], reserve: string[]) =>
    unwrap(supabase.rpc("create_session", { p_name: name, p_team_a: teamA, p_team_b: teamB, p_reserve: reserve })) as Promise<string>,
  recordResult: (sessionId: string, expectedMatchNo: number, loserSide: Side, entrants: string[]) =>
    unwrap(
      supabase.rpc("record_result", {
        p_session_id: sessionId,
        p_expected_match_no: expectedMatchNo,
        p_loser_side: loserSide,
        p_entrants: entrants,
      }),
    ),
  undo: (sessionId: string, expectedMatchNo: number) =>
    unwrap(supabase.rpc("undo_last_match", { p_session_id: sessionId, p_expected_match_no: expectedMatchNo })),
  reorderReserve: (sessionId: string, reserve: string[]) =>
    unwrap(supabase.rpc("reorder_reserve", { p_session_id: sessionId, p_reserve: reserve })),
  setNextEntrants: (sessionId: string, entrants: string[] | null) =>
    unwrap(supabase.rpc("set_next_entrants", { p_session_id: sessionId, p_entrants: entrants as string[] })),
  setStatus: (sessionId: string, status: "active" | "paused" | "finished") =>
    unwrap(supabase.rpc("set_session_status", { p_session_id: sessionId, p_status: status })),
  addParticipant: (sessionId: string, playerId: string) =>
    unwrap(supabase.rpc("add_session_participant", { p_session_id: sessionId, p_player_id: playerId })),
  removeParticipant: (sessionId: string, playerId: string, replacement?: string) =>
    unwrap(
      supabase.rpc("remove_session_participant", {
        p_session_id: sessionId,
        p_player_id: playerId,
        ...(replacement ? { p_replacement: replacement } : {}),
      }),
    ),
  setActiveSession: (sessionId: string | null) =>
    unwrap(supabase.rpc("set_active_session", { p_session_id: sessionId as string })),
  setAvoidRematches: async (value: boolean) => {
    const { data: auth } = await supabase.auth.getUser();
    return unwrap(supabase.from("profiles").update({ avoid_rematches: value }).eq("id", auth.user!.id));
  },
  createShareLink: (sessionId: string) => unwrap(supabase.rpc("create_share_link", { p_session_id: sessionId })) as Promise<string>,
  revokeShareLink: (sessionId: string) => unwrap(supabase.rpc("revoke_share_link", { p_session_id: sessionId })),
  importBackup: (data: unknown) =>
    unwrap(supabase.rpc("import_backup", { p_data: data as never })) as Promise<{ players: number; sessions: number; matches: number }>,
};

export type SharedSession = {
  name: string;
  status: "active" | "paused" | "finished";
  match_no: number;
  updated_at: string;
  team_a: string[];
  team_b: string[];
  reserve: string[];
  matches: { match_number: number; played_at: string; winner_side: Side; team_a: string[]; team_b: string[] }[];
};

export async function fetchSharedSession(token: string) {
  const { data, error } = await supabase.rpc("get_shared_session", { p_token: token });
  if (error) throw error;
  return (data as SharedSession | null) ?? null;
}
