import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/hooks/use-app-data";
import { statusLabel } from "@/components/rq/ui";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AppShell,
});

const NAV = [
  { to: "/inicio", icon: "⌂", label: "Início", short: "Início" },
  { to: "/quadra", icon: "▦", label: "Quadra", short: "Quadra" },
  { to: "/reserva", icon: "⇄", label: "Reserva", short: "Reserva" },
  { to: "/historico", icon: "◷", label: "Histórico", short: "Histórico" },
  { to: "/jogadores", icon: "♙", label: "Jogadores", short: "Jogadores" },
  { to: "/ajustes", icon: "⚙", label: "Configurações", short: "Ajustes" },
] as const;

function useConnection() {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(true);
  const [live, setLive] = useState<"connecting" | "live" | "down">("connecting");
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      queryClient.invalidateQueries();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [queryClient]);

  useEffect(() => {
    // Live sync between the owner's devices; RLS limits events to the owner's own rows.
    const channel = supabase.channel(`owner-${Math.random().toString(36).slice(2)}`);
    const invalidate = (keys: string[]) => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => invalidate(["sessions"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => invalidate(["matches", "matches-count"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => invalidate(["players"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "session_participants" }, () => invalidate(["participants"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => invalidate(["profile"]))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          queryClient.invalidateQueries();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("down");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
  return { online, live };
}

function AppShell() {
  const { session, activeSession, profile } = useAppData();
  const { online, live } = useConnection();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const syncText = !online ? "Sem conexão — alterações bloqueadas" : live === "live" ? "Sincronizado na nuvem" : live === "down" ? "Reconectando…" : "Conectando…";

  return (
    <>
      {!online && <div className="conn-banner error">Você está offline. Nada será salvo até a conexão voltar.</div>}
      {online && live === "down" && <div className="conn-banner">Reconectando à nuvem… os dados podem estar desatualizados.</div>}
      <div className="app-shell">
        <aside className="sidebar">
          <Link className="brand" to="/inicio" aria-label="Rei da Quadra, início">
            <span className="brand-mark">
              R<span>Q</span>
            </span>
            <span className="brand-copy">
              <strong>REI DA QUADRA</strong>
              <small>BEACH TENNIS</small>
            </span>
          </Link>
          <div className="sidebar-label">MENU</div>
          <nav className="side-nav" aria-label="Navegação principal">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className="nav-item" activeProps={{ className: "nav-item active" }}>
                <span>{item.icon}</span> {item.label}
                {item.to === "/reserva" && <b>{activeSession?.reserve.length ?? 0}</b>}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="live-dot"></span>
            <span>{profile?.display_name ?? "Sua conta"}</span>
            <small>{syncText}</small>
            <button className="btn btn-ghost btn-small" style={{ marginTop: 10 }} onClick={signOut}>
              Sair
            </button>
          </div>
        </aside>
        <main className="main-area">
          <header className="topbar">
            <Link className="mobile-brand" to="/inicio">
              <span className="brand-mark">
                R<span>Q</span>
              </span>
              <strong>REI DA QUADRA</strong>
            </Link>
            <div className="topbar-context">
              <span className="eyebrow">BEACH TENNIS / GESTÃO DE JOGO</span>
              <span>{session ? session.name : "Bora jogar?"}</span>
            </div>
            <div className="topbar-actions">
              <span className="status-pill">
                <span className="live-dot"></span>
                <span>
                  {session
                    ? session.status === "active"
                      ? "Jogo em andamento"
                      : session.status === "paused"
                        ? "Jogo pausado"
                        : "Sessão encerrada"
                    : "Pronto para jogar"}
                </span>
              </span>
            </div>
          </header>
          <section className="view-root" aria-live="polite">
            <Outlet />
          </section>
          <footer className="app-footer">
            <span>
              REI DA QUADRA <span className="footer-dot">•</span> FEITO PARA QUEM VIVE O JOGO
            </span>
            <span>
              {syncText}
              {session ? ` · ${statusLabel(session.status)}` : ""}
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação móvel">
        {NAV.slice(1).map((item) => (
          <Link key={item.to} to={item.to} activeProps={{ className: "active" }}>
            <span>{item.icon}</span>
            <small>{item.short}</small>
          </Link>
        ))}
      </nav>
    </>
  );
}
