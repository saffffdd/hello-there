import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAppData } from "@/hooks/use-app-data";
import { api, matchesCountQuery } from "@/lib/api";
import { ErrorBlock, Loading, dateTime, statusLabel, useAction } from "@/components/rq/ui";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Início — Rei da Quadra" },
      { name: "description", content: "Seu painel de jogos de Beach Tennis no formato Rei da Quadra." },
      { property: "og:title", content: "Início — Rei da Quadra" },
      { property: "og:description", content: "Seu painel de jogos de Beach Tennis no formato Rei da Quadra." },
    ],
  }),
  component: Home,
});

function Home() {
  const data = useAppData();
  const count = useQuery(matchesCountQuery);
  const navigate = useNavigate();
  const { run, busy } = useAction();
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorBlock error={data.error} onRetry={data.refetch} />;
  const recent = data.sessions.slice(0, 4);
  const active = data.activeSession;

  const open = async (id: string, finished: boolean) => {
    const ok = await run(() => api.setActiveSession(id));
    if (ok !== undefined) navigate({ to: finished ? "/historico" : "/quadra" });
  };

  return (
    <>
      <div className="home-hero">
        <div>
          <div className="kicker">O JOGO É SEU. A QUADRA TAMBÉM.</div>
          <h1 className="hero-title">
            Cada partida é uma chance de virar <em>rei.</em>
          </h1>
          <p>Organize a galera, sorteie as duplas e deixe a rotação com a gente. Menos tempo organizando. Mais tempo jogando.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/novo-jogo">
              ＋ Novo jogo
            </Link>
            {active ? (
              <Link className="btn btn-secondary" to="/quadra">
                Continuar jogo ↗
              </Link>
            ) : (
              <Link className="btn btn-secondary" to="/jogadores">
                ＋ Cadastrar jogadores
              </Link>
            )}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="court-symbol">⌁</span>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">♙ Jogadores cadastrados</div>
          <div className="stat-value">{data.players.length}</div>
          <div className="stat-foot">Na sua lista</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">▦ Partidas realizadas</div>
          <div className="stat-value">{count.data ?? "—"}</div>
          <div className="stat-foot">Em todas as sessões</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">◉ Sessões criadas</div>
          <div className="stat-value">{data.sessions.length}</div>
          <div className="stat-foot">{active ? "Você tem um jogo ativo" : "Pronto para começar"}</div>
        </div>
      </div>
      <div className="section-grid">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Jogos recentes</h2>
            <Link className="btn btn-ghost btn-small" to="/historico">
              Ver histórico ↗
            </Link>
          </div>
          {recent.length ? (
            <div className="recent-list">
              {recent.map((s) => (
                <div className="recent-row" key={s.id}>
                  <div className="recent-icon">▦</div>
                  <div className="recent-info">
                    <strong>{s.name}</strong>
                    <small>
                      {dateTime(s.updated_at)} · {s.match_no - 1} partida(s)
                    </small>
                  </div>
                  <span className={"tag " + (s.status === "finished" ? "gray" : "")}>{statusLabel(s.status)}</span>
                  <button className="text-button" disabled={busy} onClick={() => open(s.id, s.status === "finished")} aria-label={`Abrir ${s.name}`}>
                    ↗
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">▦</div>
              <h3>Sua próxima história começa aqui</h3>
              <p>Crie um jogo, chame os jogadores e deixe a rotação fluir.</p>
              <Link className="btn btn-primary" to="/novo-jogo">
                Criar meu primeiro jogo
              </Link>
            </div>
          )}
        </section>
        <aside className="card">
          <div className="card-head">
            <h2 className="card-title">Acesso rápido</h2>
          </div>
          <div className="quick-links">
            <Link className="quick-link" to="/jogadores">
              <span className="recent-icon">♙</span>
              <span>
                <strong>Jogadores</strong>
                <small>Cadastre e organize a galera</small>
              </span>
              <span className="arrow">↗</span>
            </Link>
            <Link className="quick-link" to="/historico">
              <span className="recent-icon">◷</span>
              <span>
                <strong>Estatísticas</strong>
                <small>Veja quem está dominando</small>
              </span>
              <span className="arrow">↗</span>
            </Link>
            <Link className="quick-link" to="/ajustes">
              <span className="recent-icon">⚙</span>
              <span>
                <strong>Configurações</strong>
                <small>Backup e preferências</small>
              </span>
              <span className="arrow">↗</span>
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
