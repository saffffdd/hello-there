import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  matchesQuery,
  participantsQuery,
  playersQuery,
  profileQuery,
  sessionsQuery,
  type MatchRow,
  type Participant,
  type SessionRow,
} from "@/lib/api";
import type { MatchRecord } from "@/lib/game";

export function useAppData() {
  const profile = useQuery(profileQuery);
  const players = useQuery(playersQuery);
  const sessions = useQuery(sessionsQuery);
  const sessionId = profile.data?.active_session_id ?? null;
  const session: SessionRow | null = useMemo(
    () => sessions.data?.find((s) => s.id === sessionId) ?? null,
    [sessions.data, sessionId],
  );
  const participants = useQuery({ ...participantsQuery(sessionId ?? "none"), enabled: !!sessionId });
  const matches = useQuery({ ...matchesQuery(sessionId ?? "none"), enabled: !!sessionId });

  const nameOf = useMemo(() => buildNameOf(participants.data, players.data), [participants.data, players.data]);

  const isLoading = profile.isLoading || players.isLoading || sessions.isLoading || (!!sessionId && (participants.isLoading || matches.isLoading));
  const error = profile.error || players.error || sessions.error || participants.error || matches.error;
  const activeSession = session && session.status !== "finished" ? session : null;

  return {
    profile: profile.data,
    players: players.data ?? [],
    sessions: sessions.data ?? [],
    session,
    activeSession,
    participants: participants.data ?? [],
    matches: matches.data ?? [],
    nameOf,
    isLoading,
    error,
    refetch: () => Promise.all([profile.refetch(), players.refetch(), sessions.refetch(), participants.refetch(), matches.refetch()]),
  };
}

export function buildNameOf(participants?: Participant[], players?: { id: string; name: string }[]) {
  const map = new Map<string, string>();
  players?.forEach((p) => map.set(p.id, p.name));
  participants?.forEach((p) => map.set(p.player_id, p.display_name));
  return (id: string) => map.get(id) ?? "Jogador removido";
}

export const toRecords = (rows: MatchRow[]): MatchRecord[] =>
  rows.map((m) => ({ matchNumber: m.match_number, teamA: m.team_a, teamB: m.team_b, winnerSide: m.winner_side }));
