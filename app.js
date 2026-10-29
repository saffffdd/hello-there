(() => {
"use strict";
const STORE_KEY = "rei-da-quadra-v1";
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
const uid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
const clone = value => JSON.parse(JSON.stringify(value));
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const dateTime = value => new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));
const dateOnly = value => new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(value));
const initials = name => String(name || "?").trim().split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase();
const randomUnit = () => {
  try { const arr = new Uint32Array(1); crypto.getRandomValues(arr); return arr[0] / 4294967296; }
  catch (_) { return Math.random(); }
};
const randomInt = max => Math.floor(randomUnit() * max);
const shuffle = items => {
  const result = items.slice();
  for (let i=result.length-1;i>0;i--) { const j=randomInt(i+1); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
};
let db = loadDb();
let currentView = "home";
let wizardDraft = null;
let deferredInstallPrompt = null;
let toastTimer = null;

function loadDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && Array.isArray(saved.players) && Array.isArray(saved.sessions)) return saved;
  } catch (_) {}
  return {version:1,players:[],sessions:[],activeSessionId:null,settings:{avoidRematches:true}};
}
function saveDb() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    $("#storage-note").textContent = "Modo local · salvo neste navegador";
    $("#sync-label").textContent = "Modo local";
    return true;
  } catch (error) {
    toast("Não foi possível salvar. Exporte um backup e libere espaço no navegador.", "error");
    return false;
  }
}
function getSession(id=db.activeSessionId) { return db.sessions.find(session=>session.id===id) || null; }
function getActiveSession() {
  const found=getSession();
  if (found && found.status!=="finished") return found;
  return null;
}
function getPlayer(id, session=getSession()) {
  if (!id) return null;
  const participant=session?.participants?.find(item=>item.id===id);
  if (participant) return participant;
  return db.players.find(item=>item.id===id) || null;
}
function playerName(id, session=getSession()) { return getPlayer(id,session)?.name || "Jogador removido"; }
function activeIds(session) { return (session?.participants || []).filter(item=>item.active!==false).map(item=>item.id); }
function courtIds(session) { return [...(session?.teamA||[]),...(session?.teamB||[])]; }
function reserveIds(session) { return session?.reserve || []; }
function allSessionIds(session) { return [...courtIds(session),...reserveIds(session)]; }
function validateSession(session) {
  if (!session || session.status==="finished") return true;
  const participants=activeIds(session), court=courtIds(session), reserve=reserveIds(session);
  if (new Set(participants).size!==participants.length) throw new Error("Há participantes duplicados na sessão.");
  if (participants.length<4) throw new Error("São necessários pelo menos quatro participantes ativos.");
  if (court.length!==4 || new Set(court).size!==4) throw new Error("A quadra precisa ter quatro jogadores distintos.");
  if (new Set(reserve).size!==reserve.length) throw new Error("Há jogadores duplicados na reserva.");
  if (court.some(id=>!participants.includes(id)) || reserve.some(id=>!participants.includes(id))) throw new Error("Há um jogador fora da lista de participantes.");
  if (court.some(id=>reserve.includes(id))) throw new Error("Um jogador não pode estar na quadra e na reserva ao mesmo tempo.");
  if (new Set([...court,...reserve]).size!==participants.length) throw new Error("A quadra e a reserva não correspondem ao total de participantes.");
  return true;
}
function snapshotSession(session) {
  return {status:session.status,teamA:session.teamA.slice(),teamB:session.teamB.slice(),reserve:session.reserve.slice(),matchNo:session.matchNo,history:clone(session.history),updatedAt:session.updatedAt};
}
function restoreSnapshot(session, snapshot) {
  session.status=snapshot.status; session.teamA=snapshot.teamA.slice(); session.teamB=snapshot.teamB.slice(); session.reserve=snapshot.reserve.slice(); session.matchNo=snapshot.matchNo; session.history=clone(snapshot.history); session.updatedAt=new Date().toISOString();
}
function toast(message,type="success") {
  const region=$("#toast-region");
  const node=document.createElement("div"); node.className="toast"+(type==="error"?" error":""); node.textContent=message;
  region.appendChild(node); setTimeout(()=>node.remove(),3600);
}
function showDialog(title, description, buttons, bodyHtml="") {
  const dialog=$("#app-dialog"), content=$("#dialog-content");
  content.innerHTML='<div class="dialog-head"><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(description)+'</p></div>'+(bodyHtml?'<div class="dialog-body">'+bodyHtml+'</div>':'')+'<div class="dialog-actions">'+buttons.map((button,index)=>'<button class="btn '+escapeHtml(button.className||"btn-secondary")+'" data-dialog-action="'+index+'">'+escapeHtml(button.label)+'</button>').join("")+'</div>';
  buttons.forEach((button,index)=>{ const element=$('[data-dialog-action="'+index+'"]',content); element.addEventListener("click",()=>{dialog.close(); if(button.action) button.action();}); });
  dialog.showModal();
}
function askConfirm(title, description, confirmLabel, callback, danger=false) {
  showDialog(title,description,[{label:"Cancelar",className:"btn-secondary"},{label:confirmLabel,className:danger?"btn-danger":"btn-primary",action:callback}]);
}
function setView(view) {
  currentView=view;
  $$(".nav-item").forEach(button=>button.classList.toggle("active",button.dataset.view===view));
  $$(".bottom-nav button").forEach(button=>button.classList.toggle("active",button.dataset.view===view));
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}
function render() {
  const root=$("#view-root");
  const session=getSession();
  $("#topbar-session").textContent=session ? session.name : "Bora jogar?";
  $("#top-status").textContent=session ? (session.status==="active"?"Jogo em andamento":session.status==="paused"?"Jogo pausado":"Sessão encerrada") : "Pronto para jogar";
  $("#reserve-count-nav").textContent=String(getActiveSession()?.reserve.length||0);
  if(currentView==="home") root.innerHTML=renderHome();
  else if(currentView==="court") root.innerHTML=renderCourt();
  else if(currentView==="reserve") root.innerHTML=renderReserve();
  else if(currentView==="history") root.innerHTML=renderHistory();
  else if(currentView==="players") root.innerHTML=renderPlayers();
  else if(currentView==="settings") root.innerHTML=renderSettings();
  else if(currentView==="wizard") root.innerHTML=renderWizard();
  bindViewEvents();
}
function renderHome() {
  const recent=db.sessions.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,4);
  const matches=db.sessions.reduce((sum,session)=>sum+(session.history?.length||0),0);
  const active=getActiveSession();
  return '<div class="home-hero"><div><div class="kicker">O JOGO É SEU. A QUADRA TAMBÉM.</div><h1 class="hero-title">Cada partida é uma chance de virar <em>rei.</em></h1><p>Organize a galera, sorteie as duplas e deixe a rotação com a gente. Menos tempo organizando. Mais tempo jogando.</p><div class="hero-actions"><button class="btn btn-primary" data-action="new-game">＋ Novo jogo</button>'+(active?'<button class="btn btn-secondary" data-view="court">Continuar jogo ↗</button>':'<button class="btn btn-secondary" data-view="players">＋ Cadastrar jogadores</button>')+'</div></div><div class="hero-art" aria-hidden="true"><span class="court-symbol">⌁</span></div></div>'+
  '<div class="stat-grid"><div class="stat-card"><div class="stat-label">♙ Jogadores cadastrados</div><div class="stat-value">'+db.players.length+'</div><div class="stat-foot">Na sua lista</div></div><div class="stat-card"><div class="stat-label">▦ Partidas realizadas</div><div class="stat-value">'+matches+'</div><div class="stat-foot">Em todas as sessões</div></div><div class="stat-card"><div class="stat-label">◉ Sessões criadas</div><div class="stat-value">'+db.sessions.length+'</div><div class="stat-foot">'+(active?"Você tem um jogo ativo":"Pronto para começar")+'</div></div></div>'+
  '<div class="section-grid"><section class="card"><div class="card-head"><h2 class="card-title">Jogos recentes</h2><button class="btn btn-ghost btn-small" data-view="history">Ver histórico ↗</button></div>'+(recent.length?'<div class="recent-list">'+recent.map(session=>'<div class="recent-row"><div class="recent-icon">▦</div><div class="recent-info"><strong>'+escapeHtml(session.name)+'</strong><small>'+dateTime(session.updatedAt)+' · '+session.history.length+' partida(s)</small></div><span class="tag '+(session.status==="finished"?"gray":"")+'">'+(session.status==="active"?"ATIVO":session.status==="paused"?"PAUSADO":"ENCERRADO")+'</span><button class="text-button" data-action="open-session" data-id="'+session.id+'" aria-label="Abrir sessão">↗</button></div>').join("")+'</div>':'<div class="empty-state"><div class="empty-icon">▦</div><h3>Sua próxima história começa aqui</h3><p>Crie um jogo, chame os jogadores e deixe a rotação fluir.</p><button class="btn btn-primary" data-action="new-game">Criar meu primeiro jogo</button></div>')+'</section><aside class="card"><div class="card-head"><h2 class="card-title">Acesso rápido</h2></div><div class="quick-links"><button class="quick-link" data-view="players"><span class="recent-icon">♙</span><span><strong>Jogadores</strong><small>Cadastre e organize a galera</small></span><span class="arrow">↗</span></button><button class="quick-link" data-view="history"><span class="recent-icon">◷</span><span><strong>Estatísticas</strong><small>Veja quem está dominando</small></span><span class="arrow">↗</span></button><button class="quick-link" data-view="settings"><span class="recent-icon">⚙</span><span><strong>Configurações</strong><small>Backup e preferências</small></span><span class="arrow">↗</span></button></div></aside></div>';
}
function renderCourt() {
  const session=getActiveSession();
  if(!session) return '<div class="page-head"><div><div class="kicker">DENTRO DA QUADRA</div><h1>Quadra</h1><p>O jogo começa quando a galera está pronta.</p></div></div><div class="card court-empty"><div class="empty-icon">▦</div><h2>Nenhum jogo em andamento</h2><p>Crie uma sessão para sortear as duplas iniciais, acompanhar a reserva e registrar cada resultado.</p><button class="btn btn-primary" data-action="new-game">＋ Criar novo jogo</button></div>';
  const paused=session.status==="paused";
  const a=session.teamA.map(id=>playerName(id,session)), b=session.teamB.map(id=>playerName(id,session));
  const last=session.history[session.history.length-1];
  return '<div class="page-head"><div><div class="kicker">PARTIDA AO VIVO</div><h1>'+escapeHtml(session.name)+'</h1><p>Partida '+session.matchNo+' · '+session.participants.filter(p=>p.active!==false).length+' jogadores na sessão</p></div><div class="inline-actions"><button class="btn btn-ghost btn-small" data-action="undo" '+(!session.undoStack?.length?'disabled':'')+'>↶ Desfazer</button><button class="btn btn-secondary btn-small" data-action="session-menu">••• Opções</button></div></div>'+
  (paused?'<div class="notice warning" style="margin-bottom:15px">Jogo pausado. Retome quando a próxima partida estiver pronta. <button class="btn btn-primary btn-small" data-action="resume">Retomar jogo</button></div>':'')+
  '<div class="court-layout"><div><section class="match-board"><div class="match-top"><div><div class="match-number">PARTIDA #'+session.matchNo.toString().padStart(2,"0")+'</div><div class="match-meta">'+(paused?"SESSÃO PAUSADA":"REI DA QUADRA · 2 CONTRA 2")+'</div></div><span class="tag '+(paused?"gray":"")+'">'+(paused?"PAUSADO":"● EM JOGO")+'</span></div><div class="teams"><div class="team-card"><div class="team-label"><span class="team-dot"></span> DUPLA A · REI</div><div class="player-name">'+escapeHtml(a[0])+'</div><div class="player-name">'+escapeHtml(a[1])+'</div><div class="team-note">Venceu? Continua na quadra.</div></div><div class="vs">VS</div><div class="team-card challenger"><div class="team-label"><span class="team-dot"></span> DUPLA B · DESAFIANTE</div><div class="player-name">'+escapeHtml(b[0])+'</div><div class="player-name">'+escapeHtml(b[1])+'</div><div class="team-note">Venceu? Continua na quadra.</div></div></div>'+
  (paused?'':'<div class="result-box"><div class="result-question">QUEM PERDEU?</div><div class="result-actions"><button class="lose-button" data-action="report-loss" data-side="A"><span class="mini-team">A</span> Dupla A perdeu</button><button class="lose-button" data-action="report-loss" data-side="B"><span class="mini-team">B</span> Dupla B perdeu</button></div></div>')+'</section>'+
  '<div class="section-block"><div class="section-block-head"><div><h2>Na reserva</h2><p>Quem está esperando para entrar</p></div><span class="badge-count">'+session.reserve.length+' jogadores</span></div>'+renderQueue(session,session.reserve.slice(0,5),false)+'<div style="margin-top:10px"><button class="btn btn-ghost btn-small" data-view="reserve">Ver fila completa ↗</button></div></div></div>'+
  '<aside class="match-side"><section class="card"><div class="card-head"><h2 class="card-title">Resumo da sessão</h2><span class="tag">'+(session.status==="active"?"ATIVO":"PAUSADO")+'</span></div><div class="side-stat"><span>Partidas concluídas</span><strong>'+session.history.length+'</strong></div><div class="side-stat"><span>Jogadores na quadra</span><strong>4 / '+session.participants.filter(p=>p.active!==false).length+'</strong></div><div class="side-stat"><span>Na reserva</span><strong>'+session.reserve.length+'</strong></div><div class="side-stat"><span>Última partida</span><strong>'+(last?"#"+last.matchNumber:"—")+'</strong></div><div class="divider"></div><div class="setting-actions">'+(paused?'<button class="btn btn-primary btn-full" data-action="resume">▶ Retomar jogo</button>':'<button class="btn btn-secondary btn-full" data-action="pause">Ⅱ Pausar jogo</button>')+'<button class="btn btn-ghost btn-full" data-action="share">↗ Compartilhar sessão</button><button class="btn btn-ghost btn-full" data-action="add-session-player">＋ Adicionar jogador</button></div></section><section class="card"><div class="card-head"><h2 class="card-title">Último resultado</h2></div>'+(last?'<div class="status-text"><span class="tiny-dot"></span> Partida #'+last.matchNumber+' · '+dateTime(last.playedAt)+'</div><p style="font-size:12px;line-height:1.7;margin:12px 0 0"><span class="winner-badge">Vencedores:</span> '+escapeHtml(last.winnerIds.map(id=>playerName(id,session)).join(" + "))+'<br><span style="color:#ff9e96">Perdedores:</span> '+escapeHtml(last.loserIds.map(id=>playerName(id,session)).join(" + "))+'</p>':'<div class="empty-inline">Nenhuma partida registrada ainda.</div>')+'</section></aside></div>';
}
function renderQueue(session, ids, showActions=true) {
  if(!ids.length) return '<div class="empty-inline">A reserva está vazia no momento.</div>';
  return '<div class="queue-list">'+ids.map((id,index)=>'<div class="queue-row"><span class="queue-position">'+(session.reserve.indexOf(id)+1)+'</span><span class="queue-player">'+escapeHtml(playerName(id,session))+'</span><span class="queue-status">'+(index===0&&showActions?"Próximo":"Aguardando")+'</span>'+(showActions?'<button class="text-button" data-action="move-up" data-id="'+id+'" aria-label="Mover para cima" '+(session.reserve.indexOf(id)===0?'disabled':'')+'>↑</button><button class="text-button" data-action="move-down" data-id="'+id+'" aria-label="Mover para baixo" '+(session.reserve.indexOf(id)===session.reserve.length-1?'disabled':'')+'>↓</button>':'')+'</div>').join("")+'</div>';
}
function renderReserve() {
  const session=getActiveSession();
  if(!session) return '<div class="page-head"><div><div class="kicker">ORDEM DE ENTRADA</div><h1>Na reserva</h1><p>Organize a fila de quem está esperando para jogar.</p></div></div><div class="card court-empty"><div class="empty-icon">⇄</div><h2>Sem sessão ativa</h2><p>Quando um jogo estiver em andamento, os jogadores que aguardam aparecem aqui.</p><button class="btn btn-primary" data-action="new-game">＋ Novo jogo</button></div>';
  return '<div class="page-head"><div><div class="kicker">ORDEM DE ENTRADA</div><h1>Na reserva</h1><p>'+escapeHtml(session.name)+' · os perdedores vão para o fim da fila.</p></div><button class="btn btn-secondary" data-action="add-session-player">＋ Adicionar jogador</button></div><div class="stat-grid"><div class="stat-card"><div class="stat-label">Pessoas na reserva</div><div class="stat-value">'+session.reserve.length+'</div></div><div class="stat-card"><div class="stat-label">Em quadra</div><div class="stat-value">4</div></div><div class="stat-card"><div class="stat-label">Participantes ativos</div><div class="stat-value">'+activeIds(session).length+'</div></div></div><section class="card"><div class="card-head"><div><h2 class="card-title">Fila completa</h2><div class="section-subtitle">Use as setas para reorganizar manualmente a ordem.</div></div><span class="badge-count">'+session.reserve.length+' na fila</span></div>'+renderQueue(session,session.reserve,true)+'<div class="divider"></div><div class="inline-actions"><button class="btn btn-secondary" data-action="manual-next" '+(session.reserve.length<2?'disabled':'')+'>Escolher próximos jogadores</button><button class="btn btn-ghost" data-action="shuffle-reserve" '+(session.reserve.length<2?'disabled':'')+'>↻ Embaralhar fila</button></div></section><section class="card section-block"><div class="card-head"><h2 class="card-title">Em quadra agora</h2><button class="btn btn-ghost btn-small" data-view="court">Ver partida ↗</button></div><div class="player-list">'+courtIds(session).map(id=>'<div class="player-card"><div class="avatar">'+escapeHtml(initials(playerName(id,session)))+'</div><div class="player-card-info"><strong>'+escapeHtml(playerName(id,session))+'</strong><small>'+ (session.teamA.includes(id)?"Dupla A · Rei":"Dupla B · Desafiante")+'</small></div></div>').join("")+'</div></section>';
}
function renderHistory() {
  const selected=getSession();
  const sessions=db.sessions.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  const session=selected;
  if(!sessions.length) return '<div class="page-head"><div><div class="kicker">DADOS REAIS DA SUA SESSÃO</div><h1>Histórico</h1><p>Partidas e estatísticas calculadas dos resultados registrados.</p></div></div><div class="card court-empty"><div class="empty-icon">◷</div><h2>Seu histórico começa na primeira partida</h2><p>Crie uma sessão e registre os resultados para acompanhar as estatísticas individuais.</p><button class="btn btn-primary" data-action="new-game">Criar novo jogo</button></div>';
  const records=session?.history||[];
  const stats=calculateStats(session);
  return '<div class="page-head"><div><div class="kicker">DADOS REAIS DA SUA SESSÃO</div><h1>Histórico</h1><p>Resultados registrados e estatísticas individuais, sem números inventados.</p></div><button class="btn btn-secondary" data-action="export-csv">↓ Exportar CSV</button></div><div class="card" style="margin-bottom:16px"><div class="field"><label for="history-session">Sessão</label><select id="history-session">'+sessions.map(item=>'<option value="'+item.id+'" '+(item.id===session?.id?'selected':'')+'>'+escapeHtml(item.name)+' · '+dateOnly(item.createdAt)+'</option>').join("")+'</select></div></div><section class="card"><div class="card-head"><div><h2 class="card-title">Estatísticas individuais</h2><div class="section-subtitle">Apenas partidas concluídas nesta sessão.</div></div><span class="badge-count">'+records.length+' partidas</span></div>'+(stats.length?'<div class="table-wrap"><table class="stats-table"><thead><tr><th>JOGADOR</th><th class="numeric">JOGOS</th><th class="numeric">VITÓRIAS</th><th class="numeric">DERROTAS</th><th class="numeric">%</th><th class="numeric">PERMANÊNCIAS</th></tr></thead><tbody>'+stats.map(stat=>'<tr><td>'+escapeHtml(stat.name)+'</td><td class="numeric">'+stat.played+'</td><td class="numeric">'+stat.wins+'</td><td class="numeric">'+stat.losses+'</td><td class="numeric">'+(stat.played?Math.round(stat.wins/stat.played*100):0)+'%</td><td class="numeric">'+stat.stays+'</td></tr>').join("")+'</tbody></table></div>':'<div class="empty-inline">Ainda não há dados suficientes para calcular estatísticas.</div>')+'</section><section class="card section-block"><div class="card-head"><div><h2 class="card-title">Partidas registradas</h2><div class="section-subtitle">Mais recente primeiro.</div></div></div>'+(records.length?'<div class="history-list">'+records.slice().reverse().map(record=>renderHistoryCard(record,session)).join("")+'</div>':'<div class="empty-state"><div class="empty-icon">◷</div><h3>Nenhuma partida registrada</h3><p>Depois de confirmar quem perdeu, a partida aparece aqui com seus detalhes.</p><button class="btn btn-secondary" data-view="court">Ir para a quadra</button></div>')+'</section>';
}
function renderHistoryCard(record,session) {
  const a=record.teamA.map(id=>playerName(id,session)).join(" + "), b=record.teamB.map(id=>playerName(id,session)).join(" + ");
  const winnerNames=record.winnerIds.map(id=>playerName(id,session)).join(" + "), loserNames=record.loserIds.map(id=>playerName(id,session)).join(" + ");
  return '<article class="history-card"><div class="history-card-top"><strong>PARTIDA #'+record.matchNumber.toString().padStart(2,"0")+'</strong><small>'+dateTime(record.playedAt)+'</small></div><div class="history-teams"><div class="history-team '+(record.winnerSide==="A"?"winner":"")+'"><small>DUPLA A '+(record.winnerSide==="A"?"· VENCEU":"")+'</small><strong>'+escapeHtml(a)+'</strong></div><div class="history-vs">VS</div><div class="history-team '+(record.winnerSide==="B"?"winner":"")+'"><small>DUPLA B '+(record.winnerSide==="B"?"· VENCEU":"")+'</small><strong>'+escapeHtml(b)+'</strong></div></div><div class="history-card-bottom"><span class="winner-badge">✓ Venceu: '+escapeHtml(winnerNames)+'</span><span>·</span><span>Perdeu: '+escapeHtml(loserNames)+'</span>'+(record.entrants?.length?'<span>· Entraram: '+escapeHtml(record.entrants.map(id=>playerName(id,session)).join(" + "))+'</span>':'')+'</div></article>';
}
function calculateStats(session) {
  if(!session) return [];
  const ids=new Set();
  session.participants.forEach(p=>ids.add(p.id));
  session.history.forEach(record=>[...record.teamA,...record.teamB].forEach(id=>ids.add(id)));
  return Array.from(ids).map(id=>{
    let played=0,wins=0,losses=0,stays=0;
    session.history.forEach((record,index)=>{
      if(record.teamA.includes(id)||record.teamB.includes(id)) {
        played++;
        if(record.winnerIds.includes(id)) { wins++; if(index<session.history.length-1) stays++; }
        else losses++;
      }
    });
    return {id,name:playerName(id,session),played,wins,losses,stays};
  }).filter(stat=>stat.played>0).sort((a,b)=>b.wins-a.wins||b.played-a.played||a.name.localeCompare(b.name,"pt-BR"));
}
function renderPlayers() {
  const query=(window.playerSearchQuery||"").toLowerCase();
  const players=db.players.filter(player=>player.name.toLowerCase().includes(query));
  const session=getActiveSession();
  const statusFor=player=>{
    if(!session||!activeIds(session).includes(player.id)) return "Cadastro";
    if(courtIds(session).includes(player.id)) return session.teamA.includes(player.id)?"Em quadra · Dupla A":"Em quadra · Dupla B";
    return "Na reserva · posição "+(session.reserve.indexOf(player.id)+1);
  };
  return '<div class="page-head"><div><div class="kicker">SUA GALERA, SEM REPETIR NOMES</div><h1>Jogadores</h1><p>Cadastre uma vez e selecione a galera a cada sessão.</p></div><button class="btn btn-primary" data-action="add-player">＋ Novo jogador</button></div><div class="player-toolbar"><div class="search-wrap"><span class="search-symbol">⌕</span><input class="search-input" id="player-search" type="search" placeholder="Buscar jogador pelo nome..." value="'+escapeHtml(window.playerSearchQuery||"")+'"></div><span class="badge-count">'+db.players.length+' cadastrados</span></div>'+(players.length?'<div class="player-list">'+players.map(player=>'<article class="player-card"><div class="avatar">'+escapeHtml(initials(player.name))+'</div><div class="player-card-info"><strong>'+escapeHtml(player.name)+'</strong><small>'+escapeHtml(statusFor(player))+'</small></div><div class="player-card-actions"><button class="text-button" data-action="edit-player" data-id="'+player.id+'" aria-label="Editar '+escapeHtml(player.name)+'">✎</button><button class="text-button" data-action="remove-player" data-id="'+player.id+'" aria-label="Remover '+escapeHtml(player.name)+'">×</button></div></article>').join("")+'</div>':'<div class="card empty-state"><div class="empty-icon">♙</div><h3>'+(query?'Nenhum jogador encontrado':'Cadastre sua primeira pessoa')+'</h3><p>'+(query?'Tente buscar por outro nome.':'Mantenha a lista pronta para criar novos jogos em poucos toques.')+'</p>'+(query?'':'<button class="btn btn-primary" data-action="add-player">＋ Cadastrar jogador</button>')+'</div>')+'<section class="card section-block"><div class="card-head"><div><h2 class="card-title">Participantes da sessão</h2><div class="section-subtitle">Adicionar alguém durante o jogo coloca a pessoa no fim da reserva.</div></div></div>'+(session?'<div class="player-list">'+session.participants.filter(p=>p.active!==false).map(p=>'<div class="player-card"><div class="avatar">'+escapeHtml(initials(p.name))+'</div><div class="player-card-info"><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(statusFor(p))+'</small></div><button class="text-button" data-action="remove-session-player" data-id="'+p.id+'" aria-label="Remover da sessão">×</button></div>').join("")+'</div><div class="divider"></div><button class="btn btn-secondary" data-action="add-session-player">＋ Adicionar à sessão</button>':'<div class="empty-inline">Crie uma sessão para gerenciar os participantes em jogo.</div>')+'</section>';
}
function renderSettings() {
  const session=getSession();
  return '<div class="page-head"><div><div class="kicker">CONTROLE DO JOGO</div><h1>Configurações</h1><p>Preferências, backup e opções da sessão.</p></div></div><div class="settings-grid"><section class="card"><div class="card-head"><h2 class="card-title">Sessão atual</h2><span class="tag '+(!session||session.status==="finished"?"gray":"")+'">'+(!session?"NENHUMA":session.status==="active"?"ATIVA":session.status==="paused"?"PAUSADA":"ENCERRADA")+'</span></div>'+(session?'<div class="setting-row"><div><strong>'+escapeHtml(session.name)+'</strong><small>Criada em '+dateTime(session.createdAt)+'</small></div></div><div class="setting-row"><div><strong>Partidas concluídas</strong><small>Resultados confirmados</small></div><span class="highlight-number">'+session.history.length+'</span></div><div class="setting-actions" style="margin-top:16px">'+(session.status==="active"?'<button class="btn btn-secondary btn-full" data-action="pause">Ⅱ Pausar jogo</button>':session.status==="paused"?'<button class="btn btn-primary btn-full" data-action="resume">▶ Retomar jogo</button>':'')+'<button class="btn btn-ghost btn-full" data-action="duplicate-session">Duplicar participantes desta sessão</button>'+(session.status!=="finished"?'<button class="btn btn-danger btn-full" data-action="finish-session">Encerrar sessão</button>':'')+'<button class="btn btn-secondary btn-full" data-action="new-game">＋ Iniciar nova sessão</button></div>':'<div class="empty-inline">Nenhuma sessão selecionada.</div><button class="btn btn-primary btn-full" data-action="new-game">Criar sessão</button>')+'</section><section class="card"><div class="card-head"><h2 class="card-title">Dados e backup</h2></div><div class="notice">Este projeto está no <strong>modo local</strong>: seus dados ficam neste navegador. O Supabase ainda precisa ser configurado para sincronizar entre dispositivos.</div><div class="setting-actions" style="margin-top:16px"><button class="btn btn-secondary btn-full" data-action="export-backup">↓ Exportar backup JSON</button><button class="btn btn-secondary btn-full" data-action="import-backup">↑ Importar backup JSON</button><button class="btn btn-ghost btn-full" data-action="share">↗ Compartilhar sessão</button><input id="backup-file" type="file" accept="application/json,.json" class="hidden"></div></section><section class="card"><div class="card-head"><h2 class="card-title">Regras de sorteio</h2></div><div class="rule-row"><label for="avoid-rematches">Priorizar variedade de confrontos e parceiros</label><input id="avoid-rematches" class="switch" type="checkbox" '+(db.settings.avoidRematches?'checked':'')+'></div><p class="muted">O sorteio continua aleatório; quando há alternativas, a pontuação favorece combinações menos repetidas. Com apenas quatro jogadores, a repetição é permitida.</p><div class="divider"></div><div class="setting-row"><div><strong>Formato</strong><small>Rei da Quadra · duplas 2x2</small></div><span class="tag">PADRÃO</span></div></section><section class="card"><div class="card-head"><h2 class="card-title">Supabase e sincronização</h2></div><p class="muted">O esquema inicial e as políticas RLS estão no arquivo supabase-schema.sql. Para ativar autenticação, compartilhamento protegido e atualização em tempo real, ainda é necessário configurar o projeto e as funções de servidor.</p><div class="divider"></div><ul class="list-bullets"><li>Crie um projeto no Supabase.</li><li>Execute o SQL do repositório.</li><li>Configure Auth, políticas de leitura e gravações transacionais.</li><li>Não exponha a chave service_role no navegador.</li></ul><button class="btn btn-ghost btn-full" data-action="open-readme">Ver instruções do projeto ↗</button></section></div><section class="card section-block"><div class="card-head"><h2 class="card-title">Sessões anteriores</h2><span class="badge-count">'+db.sessions.length+' total</span></div>'+(db.sessions.length?'<div class="recent-list">'+db.sessions.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(item=>'<div class="recent-row"><div class="recent-icon">◷</div><div class="recent-info"><strong>'+escapeHtml(item.name)+'</strong><small>'+dateTime(item.createdAt)+' · '+item.history.length+' partida(s)</small></div><span class="tag '+(item.status==="finished"?"gray":"")+'">'+(item.status==="finished"?"ENCERRADO":item.status==="paused"?"PAUSADO":"ATIVO")+'</span><button class="text-button" data-action="open-session" data-id="'+item.id+'">↗</button></div>').join("")+'</div>':'<div class="empty-inline">As sessões anteriores aparecerão aqui.</div>')+'</section>';
}
function parseNames(text) {
  const names=String(text||"").split(/[\n,;]+/).map(name=>name.trim().replace(/\s+/g," ")).filter(Boolean);
  const seen=new Set(), uniqueNames=[];
  names.forEach(name=>{const key=name.toLocaleLowerCase("pt-BR");if(!seen.has(key)){seen.add(key);uniqueNames.push(name);}});
  return uniqueNames;
}
function renderWizard() {
  if(!wizardDraft) wizardDraft={name:"",names:db.players.map(p=>p.name).join("\n"),mode:"random",manualIds:[],step:1};
  const names=parseNames(wizardDraft.names);
  const nameToPlayer=new Map(db.players.map(p=>[p.name.toLocaleLowerCase("pt-BR"),p.id]));
  const available=names.map(name=>({name,id:nameToPlayer.get(name.toLocaleLowerCase("pt-BR"))||null,key:name.toLocaleLowerCase("pt-BR")}));
  wizardDraft.manualIds=wizardDraft.manualIds.filter(id=>available.some(p=>p.id===id||("new:"+p.key)===id));
  return '<div class="page-head"><div><div class="kicker">PREPARE A SESSÃO</div><h1>Novo jogo</h1><p>Configure os participantes. O sorteio e a rotação cuidam do resto.</p></div><button class="btn btn-ghost" data-action="cancel-wizard">Cancelar</button></div><div class="wizard-card"><div class="wizard-steps"><span class="wizard-step active"></span><span class="wizard-step '+(wizardDraft.step>=2?"active":"")+'"></span><span class="wizard-step '+(wizardDraft.step>=3?"active":"")+'"></span></div><section class="card"><div class="kicker">PASSO 1 DE 3</div><h2 class="section-title" style="font-size:20px;margin:9px 0 7px">Dê um nome para o jogo</h2><p class="muted" style="margin-bottom:19px">Um nome fácil de encontrar no seu histórico.</p><div class="form-grid"><div class="field full"><label for="session-name">Nome da sessão</label><input id="session-name" placeholder="Ex.: Beach de quinta" value="'+escapeHtml(wizardDraft.name)+'" maxlength="70"></div><div class="field full"><label for="session-names">Lista de jogadores</label><textarea id="session-names" placeholder="Digite um nome por linha ou cole uma lista separada por vírgulas...">'+escapeHtml(wizardDraft.names)+'</textarea><span class="field-help">Nomes repetidos são removidos automaticamente. Jogadores cadastrados podem ser reutilizados.</span></div></div><div class="stat-grid" style="margin-bottom:0"><div class="stat-card"><div class="stat-label">Participantes únicos</div><div class="stat-value" id="wizard-player-count">'+names.length+'</div></div><div class="stat-card"><div class="stat-label">Em quadra</div><div class="stat-value">4</div></div><div class="stat-card"><div class="stat-label">Na reserva</div><div class="stat-value">'+Math.max(0,names.length-4)+'</div></div></div><div class="divider"></div><div class="field"><label>Duplas iniciais</label><div class="radio-cards"><label class="radio-card"><input type="radio" name="start-mode" value="random" '+(wizardDraft.mode==="random"?"checked":"")+'><span><strong>Sorteio automático</strong><small>Embaralha os jogadores para formar as duas duplas.</small></span></label><label class="radio-card"><input type="radio" name="start-mode" value="manual" '+(wizardDraft.mode==="manual"?"checked":"")+'><span><strong>Escolher manualmente</strong><small>Você escolhe as quatro pessoas que começam.</small></span></label></div></div>'+(wizardDraft.mode==="manual"?'<div class="field" style="margin-top:17px"><label>Selecione exatamente quatro pessoas</label><div class="player-pick-grid">'+available.map(p=>'<label class="player-pick"><input type="checkbox" data-manual-player="'+escapeHtml(p.id||("new:"+p.key))+'" '+(wizardDraft.manualIds.includes(p.id||("new:"+p.key))?"checked":"")+'><span>'+escapeHtml(p.name)+'</span></label>').join("")+'</div><span class="field-help">As quatro pessoas selecionadas serão embaralhadas em duas duplas.</span></div>':'')+'<div class="wizard-footer"><button class="btn btn-ghost" data-action="cancel-wizard">Cancelar</button><button class="btn btn-primary" data-action="start-session">Começar jogo →</button></div></section><p class="muted" style="text-align:center;margin-top:13px">Mínimo de 4 jogadores · Sem duplas fixas · Resultados só são registrados após confirmação.</p></div>';
}
function bindViewEvents() {
  $$("[data-view]").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
  $$("[data-action]").forEach(button=>button.addEventListener("click",()=>handleAction(button.dataset.action,button.dataset)));
  const search=$("#player-search");
  if(search) search.addEventListener("input",()=>{const position=search.selectionStart;window.playerSearchQuery=search.value;const root=$("#view-root");const scroll=window.scrollY;root.innerHTML=renderPlayers();bindViewEvents();const next=$("#player-search");next?.focus();next?.setSelectionRange(position,position);window.scrollTo(0,scroll);});
  const historySelect=$("#history-session");
  if(historySelect) historySelect.addEventListener("change",()=>{db.activeSessionId=historySelect.value;saveDb();render();});
  const avoid=$("#avoid-rematches");
  if(avoid) avoid.addEventListener("change",()=>{db.settings.avoidRematches=avoid.checked;saveDb();toast("Preferência de sorteio salva.");});
  const backup=$("#backup-file");
  if(backup) backup.addEventListener("change",handleBackupImport);
  const sessionName=$("#session-name");
  if(sessionName) sessionName.addEventListener("input",()=>{if(wizardDraft)wizardDraft.name=sessionName.value;});
  const sessionNames=$("#session-names");
  if(sessionNames) sessionNames.addEventListener("input",()=>{if(wizardDraft)wizardDraft.names=sessionNames.value;const currentMode=wizardDraft.mode;const name=wizardDraft.name;const manualIds=wizardDraft.manualIds;wizardDraft={...wizardDraft,name,names:sessionNames.value,mode:currentMode,manualIds,step:1};const caret=sessionNames.selectionStart;render();const next=$("#session-names");next?.focus();next?.setSelectionRange(caret,caret);});
  $$('input[name="start-mode"]').forEach(input=>input.addEventListener("change",()=>{wizardDraft.mode=input.value;render();}));
  $$("[data-manual-player]").forEach(input=>input.addEventListener("change",()=>{
    const id=input.dataset.manualPlayer;
    if(input.checked) { if(wizardDraft.manualIds.length>=4){input.checked=false;toast("Selecione no máximo quatro jogadores.","error");return;} wizardDraft.manualIds.push(id); }
    else wizardDraft.manualIds=wizardDraft.manualIds.filter(item=>item!==id);
    const count=wizardDraft.manualIds.length;
    const label=$(".field-help",input.closest(".field")||$("#view-root"));
    render();
  }));
}
function handleAction(action,data={}) {
  switch(action) {
    case "new-game": wizardDraft={name:"",names:db.players.map(p=>p.name).join("\n"),mode:"random",manualIds:[],step:1};setView("wizard");break;
    case "cancel-wizard": wizardDraft=null;setView("home");break;
    case "start-session": startSession();break;
    case "add-player": playerEditor();break;
    case "edit-player": playerEditor(data.id);break;
    case "remove-player": removeGlobalPlayer(data.id);break;
    case "open-session": openSession(data.id);break;
    case "report-loss": confirmResult(data.side);break;
    case "undo": undoLastMatch();break;
    case "pause": changeSessionStatus("paused");break;
    case "resume": changeSessionStatus("active");break;
    case "finish-session": finishSession();break;
    case "session-menu": sessionMenu();break;
    case "move-up": moveQueue(data.id,-1);break;
    case "move-down": moveQueue(data.id,1);break;
    case "shuffle-reserve": shuffleReserve();break;
    case "manual-next": chooseManualNext();break;
    case "add-session-player": addSessionPlayer();break;
    case "remove-session-player": removeSessionPlayer(data.id);break;
    case "share": shareSession();break;
    case "export-backup": exportBackup();break;
    case "import-backup": $("#backup-file")?.click();break;
    case "export-csv": exportCsv();break;
    case "duplicate-session": duplicateSession();break;
    case "open-readme": window.open("https://github.com/saffffdd/hello-there/blob/main/README.md","_blank","noopener");break;
  }
}
function playerEditor(id) {
  const existing=id?db.players.find(player=>player.id===id):null;
  const body='<div class="field"><label for="edit-player-name">Nome do jogador</label><input id="edit-player-name" maxlength="60" placeholder="Digite o nome" value="'+escapeHtml(existing?.name||"")+'"></div>';
  showDialog(existing?"Editar jogador":"Novo jogador",existing?"Atualize o nome no cadastro.":"O nome fica salvo para reutilizar em outras sessões.",[{label:"Cancelar"},{label:existing?"Salvar alterações":"Cadastrar jogador",className:"btn-primary",action:()=>{
    const name=$("#edit-player-name")?.value.trim().replace(/\s+/g," ");
    if(!name){toast("Digite um nome para continuar.","error");return;}
    const duplicate=db.players.find(player=>player.name.toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR")&&player.id!==id);
    if(duplicate){toast("Já existe um jogador com esse nome.","error");return;}
    if(existing) {
      existing.name=name;
      db.sessions.forEach(session=>session.participants.forEach(p=>{if(p.id===id)p.name=name;}));
    } else db.players.push({id:uid(),name,createdAt:new Date().toISOString()});
    saveDb();render();toast(existing?"Nome atualizado.":"Jogador cadastrado.");
  }}],body);
  setTimeout(()=>$("#edit-player-name")?.focus(),30);
}
function removeGlobalPlayer(id) {
  const player=db.players.find(item=>item.id===id); if(!player)return;
  const inSession=db.sessions.some(session=>session.status!=="finished"&&activeIds(session).includes(id));
  if(inSession){toast("Este jogador está em uma sessão ativa. Remova-o da sessão primeiro.","error");return;}
  askConfirm("Remover jogador?",""+player.name+" será removido do cadastro. O histórico anterior será preservado.","Remover",()=>{
    db.players=db.players.filter(item=>item.id!==id);saveDb();render();toast("Jogador removido do cadastro.");
  },true);
}
function startSession() {
  if(!wizardDraft)return;
  const name=(wizardDraft.name||"").trim()||"Jogo de Beach Tennis";
  const names=parseNames(wizardDraft.names);
  if(names.length<4){toast("Adicione pelo menos quatro jogadores para começar.","error");return;}
  if(wizardDraft.mode==="manual"&&wizardDraft.manualIds.length!==4){toast("Selecione exatamente quatro jogadores para começar.","error");return;}
  const participants=names.map(displayName=>{
    let player=db.players.find(p=>p.name.toLocaleLowerCase("pt-BR")===displayName.toLocaleLowerCase("pt-BR"));
    if(!player){player={id:uid(),name:displayName,createdAt:new Date().toISOString()};db.players.push(player);}
    return {id:player.id,name:player.name,active:true};
  });
  const ids=participants.map(p=>p.id);
  let initialIds;
  if(wizardDraft.mode==="manual") {
    initialIds=wizardDraft.manualIds.map(selected=>{
      if(selected.startsWith("new:")) {
        const match=participants.find(p=>p.name.toLocaleLowerCase("pt-BR")===selected.slice(4));
        return match?.id;
      }
      return selected;
    }).filter(Boolean);
    if(initialIds.length!==4||new Set(initialIds).size!==4||initialIds.some(id=>!ids.includes(id))){toast("A seleção manual mudou. Confira os quatro jogadores.","error");return;}
  } else initialIds=shuffle(ids).slice(0,4);
  const shuffledCourt=shuffle(initialIds);
  const now=new Date().toISOString();
  const session={id:uid(),name,status:"active",createdAt:now,updatedAt:now,participants,teamA:shuffledCourt.slice(0,2),teamB:shuffledCourt.slice(2,4),reserve:shuffle(ids.filter(id=>!initialIds.includes(id))),matchNo:1,history:[],undoStack:[],shareToken:uid()};
  try{validateSession(session);}catch(error){toast(error.message,"error");return;}
  db.sessions.push(session);db.activeSessionId=session.id;wizardDraft=null;saveDb();setView("court");toast("Jogo criado. Boa partida!");
}
function openSession(id) {
  const session=getSession(id);if(!session)return;
  db.activeSessionId=id;saveDb();
  setView(session.status==="finished"?"history":"court");
}
function changeSessionStatus(status) {
  const session=getSession();if(!session)return;
  if(status==="active"&&session.status==="finished"){toast("Esta sessão já foi encerrada.","error");return;}
  session.status=status;session.updatedAt=new Date().toISOString();saveDb();render();toast(status==="paused"?"Jogo pausado.":"Jogo retomado.");
}
function finishSession() {
  const session=getSession();if(!session||session.status==="finished")return;
  askConfirm("Encerrar sessão?","O jogo será marcado como encerrado. O histórico e as estatísticas continuarão disponíveis.","Encerrar sessão",()=>{
    session.status="finished";session.updatedAt=new Date().toISOString();saveDb();render();toast("Sessão encerrada.");
  },true);
}
function sessionMenu() {
  const session=getSession();if(!session)return;
  showDialog("Opções da sessão",session.name,[{label:"Cancelar"},{label:session.status==="paused"?"Retomar jogo":"Pausar jogo",className:"btn-secondary",action:()=>changeSessionStatus(session.status==="paused"?"active":"paused")},{label:"Encerrar sessão",className:"btn-danger",action:finishSession}]);
}
function pairKey(pair) { return pair.slice().sort().join("|"); }
function comboScore(pair, winner, session) {
  if(!db.settings.avoidRematches||session.history.length===0)return 0;
  let score=0;const candidate=pairKey(pair);
  const recent=session.history.slice(-5).reverse();
  recent.forEach((record,index)=>{
    const decay=Math.max(1,5-index);
    if(pairKey(record.teamA)===candidate||pairKey(record.teamB)===candidate) score-=decay*5;
    const opponents=pair.every(id=>record.teamA.includes(id))?record.teamB:pair.every(id=>record.teamB.includes(id))?record.teamA:null;
    if(opponents&&pairKey(opponents)===pairKey(winner))score-=decay*3;
    const overlap=pair.filter(id=>record.teamA.includes(id)||record.teamB.includes(id)).length;
    score-=Math.max(0,overlap-0)*0.15;
  });
  return score;
}
function chooseEntrants(pool,winner,session) {
  if(pool.length<2)return [];
  const candidates=[];
  for(let i=0;i<pool.length;i++) for(let j=i+1;j<pool.length;j++) {
    const pair=[pool[i],pool[j]];
    candidates.push({pair,score:comboScore(pair,winner,session)+randomUnit()*1.25});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0].score;
  const top=candidates.filter(item=>best-item.score<0.45);
  return top[randomInt(top.length)].pair;
}
function confirmResult(loserSide) {
  const session=getActiveSession();if(!session||session.status!=="active")return;
  const loser=loserSide==="A"?session.teamA.slice():session.teamB.slice();
  const winner=loserSide==="A"?session.teamB.slice():session.teamA.slice();
  const pool=session.reserve.concat(loser);
  const entrants=session.nextEntrants && session.nextEntrants.length===2 && session.nextEntrants.every(id=>session.reserve.includes(id)) ? session.nextEntrants.slice() : chooseEntrants(pool,winner,session);
  const winnerText=winner.map(id=>playerName(id,session)).join(" + ");
  const loserText=loser.map(id=>playerName(id,session)).join(" + ");
  const nextText=entrants.length?entrants.map(id=>playerName(id,session)).join(" + "):"Não há dois desafiantes disponíveis";
  const body='<div class="history-teams"><div class="history-team winner"><small>CONTINUAM</small><strong>'+escapeHtml(winnerText)+'</strong></div><div class="history-vs">VS</div><div class="history-team"><small>SAEM</small><strong>'+escapeHtml(loserText)+'</strong></div></div><div class="divider"></div><div class="field"><label>Próxima dupla desafiante</label><div style="font-size:13px;line-height:1.7">'+escapeHtml(nextText)+'</div></div><p class="muted" style="margin-top:12px">O resultado só será salvo depois de confirmar. A ação pode ser desfeita.</p>';
  showDialog("Confirmar resultado?","Partida #"+session.matchNo+" · confira quem venceu e quem perdeu.",[{label:"Cancelar"},{label:"Confirmar rotação",className:"btn-primary",action:()=>recordResult(loserSide,entrants)}],body);
}
function recordResult(loserSide, entrants) {
  const session=getActiveSession();if(!session||session.status!=="active")return;
  const snapshot=snapshotSession(session);
  const teamA=session.teamA.slice(),teamB=session.teamB.slice();
  const winnerSide=loserSide==="A"?"B":"A";
  const winnerIds=(winnerSide==="A"?teamA:teamB).slice();
  const loserIds=(loserSide==="A"?teamA:teamB).slice();
  const pool=session.reserve.concat(loserIds);
  let selected=entrants.filter(id=>pool.includes(id));
  if(selected.length!==2||new Set(selected).size!==2) selected=chooseEntrants(pool,winnerIds,session);
  if(selected.length!==2) {
    toast("Não há dois jogadores disponíveis para formar a próxima dupla.","error");
    return;
  }
  const playedAt=new Date().toISOString();
  const record={id:uid(),matchNumber:session.matchNo,playedAt,teamA,teamB,winnerSide,loserSide,winnerIds,loserIds,entrants:selected.slice()};
  session.undoStack=session.undoStack||[];
  session.undoStack.push(snapshot);
  session.history.push(record);
  session.teamA=winnerSide==="A"?winnerIds.slice():selected.slice();
  session.teamB=winnerSide==="B"?winnerIds.slice():selected.slice();
  session.reserve=pool.filter(id=>!selected.includes(id));session.nextEntrants=null;
  session.matchNo+=1;session.updatedAt=playedAt;
  try{validateSession(session);}catch(error){restoreSnapshot(session,snapshot);session.undoStack.pop();session.history.pop();toast("Rotação cancelada: "+error.message,"error");return;}
  saveDb();render();toast("Resultado registrado. A próxima partida está pronta!");
}
function undoLastMatch() {
  const session=getSession();
  if(!session||!session.history.length||!session.undoStack?.length){toast("Não há uma partida para desfazer.","error");return;}
  const record=session.history[session.history.length-1];
  askConfirm("Desfazer a última partida?","A partida #"+record.matchNumber+" será removida do histórico e a quadra, a reserva e as estatísticas voltarão ao estado anterior.","Desfazer partida",()=>{
    const snapshot=session.undoStack.pop();
    restoreSnapshot(session,snapshot);
    try{validateSession(session);}catch(error){toast("Não foi possível restaurar o estado: "+error.message,"error");return;}
    saveDb();render();toast("Última partida desfeita. O estado anterior foi restaurado.");
  },true);
}
function moveQueue(id,delta) {
  const session=getActiveSession();if(!session)return;
  const index=session.reserve.indexOf(id),next=index+delta;
  if(index<0||next<0||next>=session.reserve.length)return;
  [session.reserve[index],session.reserve[next]]=[session.reserve[next],session.reserve[index]];
  session.updatedAt=new Date().toISOString();saveDb();render();
}
function shuffleReserve() {
  const session=getActiveSession();if(!session||session.reserve.length<2)return;
  session.reserve=shuffle(session.reserve);session.updatedAt=new Date().toISOString();saveDb();render();toast("Fila embaralhada.");
}
function chooseManualNext() {
  const session=getActiveSession();if(!session||session.reserve.length<2)return;
  const body='<div class="field"><label>Escolha dois jogadores da reserva</label><div class="player-pick-grid">'+session.reserve.map(id=>'<label class="player-pick"><input type="checkbox" data-manual-next-id="'+id+'"><span>'+escapeHtml(playerName(id,session))+'</span></label>').join("")+'</div><span class="field-help">A dupla vencedora permanece. Os dois escolhidos entram como desafiantes na próxima partida.</span></div>';
  showDialog("Escolher próximos desafiantes","Selecione duas pessoas da reserva. A ordem da fila será preservada para os demais.",[{label:"Cancelar"},{label:"Confirmar dupla",className:"btn-primary",action:()=>{
    const selected=$$("[data-manual-next-id]").filter(input=>input.checked).map(input=>input.dataset.manualNextId);
    if(selected.length!==2){toast("Selecione exatamente dois jogadores.","error");return;}
    setManualEntrants(session.id,selected);
  }}],body);
}
function setManualEntrants(sessionId, selected) {
  const session=getSession(sessionId);if(!session||session.status==="finished")return;
  const pool=session.reserve.slice();
  if(selected.length!==2||selected.some(id=>!pool.includes(id))||new Set(selected).size!==2){toast("Seleção inválida. Atualize a fila e tente novamente.","error");return;}
  askConfirm("Confirmar próxima dupla?","Os desafiantes serão "+selected.map(id=>playerName(id,session)).join(" + ")+". A dupla que está em quadra permanece até o resultado da partida atual.","Confirmar escolha",()=>{
    session.nextEntrants=selected.slice();session.updatedAt=new Date().toISOString();saveDb();toast("Próximos desafiantes escolhidos. Eles serão usados após o resultado da partida atual.");
  });
}
function addSessionPlayer() {
  const session=getActiveSession();if(!session)return;
  const eligible=db.players.filter(player=>!activeIds(session).includes(player.id));
  const body='<div class="field"><label for="add-session-select">Jogador cadastrado</label><select id="add-session-select"><option value="">Selecione alguém…</option>'+eligible.map(p=>'<option value="'+p.id+'">'+escapeHtml(p.name)+'</option>').join("")+'</select></div><div class="divider"></div><div class="field"><label for="add-session-new">Ou cadastre um novo nome</label><input id="add-session-new" placeholder="Nome do jogador" maxlength="60"></div>';
  showDialog("Adicionar participante","A pessoa entra no fim da fila da reserva.",[{label:"Cancelar"},{label:"Adicionar à reserva",className:"btn-primary",action:()=>{
    const selected=$("#add-session-select")?.value;const newName=$("#add-session-new")?.value.trim().replace(/\s+/g," ");
    let player=selected?db.players.find(p=>p.id===selected):null;
    if(!player&&newName){
      const duplicate=db.players.find(p=>p.name.toLocaleLowerCase("pt-BR")===newName.toLocaleLowerCase("pt-BR"));
      if(duplicate)player=duplicate;else{player={id:uid(),name:newName,createdAt:new Date().toISOString()};db.players.push(player);}
    }
    if(!player){toast("Selecione um jogador ou digite um nome.","error");return;}
    if(activeIds(session).includes(player.id)){toast("Esse jogador já participa desta sessão.","error");return;}
    session.participants.push({id:player.id,name:player.name,active:true});session.reserve.push(player.id);session.updatedAt=new Date().toISOString();
    try{validateSession(session);}catch(error){toast(error.message,"error");return;}
    saveDb();render();toast(player.name+" entrou na reserva.");
  }}],body);
}
function removeSessionPlayer(id) {
  const session=getActiveSession();if(!session)return;
  const participant=session.participants.find(p=>p.id===id);if(!participant)return;
  if(activeIds(session).length<=4){toast("A sessão precisa manter pelo menos quatro participantes ativos.","error");return;}
  const inCourt=courtIds(session).includes(id);
  if(!inCourt) {
    askConfirm("Remover da sessão?",""+participant.name+" será retirado da reserva e da lista de participantes desta sessão.","Remover participante",()=>{
      session.reserve=session.reserve.filter(pid=>pid!==id);session.participants=session.participants.filter(p=>p.id!==id);session.updatedAt=new Date().toISOString();saveDb();render();toast("Participante removido da sessão.");
    },true);
    return;
  }
  const replacements=session.reserve.slice();
  if(!replacements.length){toast("Não há reserva para substituir este jogador. Adicione alguém antes de removê-lo.","error");return;}
  const body='<div class="field"><label for="replacement-select">Quem entra no lugar de '+escapeHtml(participant.name)+'?</label><select id="replacement-select">'+replacements.map(pid=>'<option value="'+pid+'">'+escapeHtml(playerName(pid,session))+'</option>').join("")+'</select></div><p class="muted" style="margin-top:12px">A pessoa escolhida assume a posição na dupla; '+escapeHtml(participant.name)+' sai da sessão.</p>';
  showDialog("Substituir jogador em quadra","A troca será aplicada de uma vez para manter a quadra consistente.",[{label:"Cancelar"},{label:"Confirmar troca",className:"btn-primary",action:()=>{
    const replacement=$("#replacement-select")?.value;
    if(!replacement||!session.reserve.includes(replacement)){toast("Escolha um substituto válido.","error");return;}
    const team=session.teamA.includes(id)?session.teamA:session.teamB;
    const slot=team.indexOf(id);team[slot]=replacement;
    session.reserve=session.reserve.filter(pid=>pid!==replacement&&pid!==id);
    session.participants=session.participants.filter(p=>p.id!==id);
    session.updatedAt=new Date().toISOString();
    try{validateSession(session);}catch(error){toast(error.message,"error");return;}
    saveDb();render();toast("Troca realizada. A quadra continua com quatro jogadores.");
  }}],body);
}
function duplicateSession() {
  const session=getSession();if(!session)return;
  wizardDraft={name:session.name+" (novo jogo)",names:session.participants.filter(p=>p.active!==false).map(p=>p.name).join("\n"),mode:"random",manualIds:[],step:1};
  setView("wizard");
}
function shareSession() {
  const session=getSession();if(!session)return;
  const url=new URL(window.location.href);url.searchParams.set("session",session.id);
  const description="O modo local não sincroniza dados entre dispositivos. Este link contém apenas o identificador da sessão e não publica o placar. Configure Supabase e uma função de compartilhamento seguro para convidados.";
  showDialog("Compartilhar sessão",""+session.name,[{label:"Fechar"},{label:"Copiar link",className:"btn-primary",action:()=>{
    if(navigator.clipboard?.writeText) navigator.clipboard.writeText(url.href).then(()=>toast("Link copiado. Atenção: ele não compartilha dados entre dispositivos no modo local.")).catch(()=>prompt("Copie o link da sessão:",url.href));
    else prompt("Copie o link da sessão:",url.href);
  }}],'<div class="field"><label>Link da sessão</label><input readonly value="'+escapeHtml(url.href)+'"></div><div class="notice warning" style="margin-top:13px">'+escapeHtml(description)+'</div>');
}
function exportBackup() {
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  downloadBlob(blob,"rei-da-quadra-backup-"+new Date().toISOString().slice(0,10)+".json");toast("Backup JSON exportado.");
}
function handleBackupImport(event) {
  const file=event.target.files?.[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const imported=JSON.parse(reader.result);
      if(!imported||!Array.isArray(imported.players)||!Array.isArray(imported.sessions))throw new Error("Formato de backup inválido.");
      askConfirm("Importar backup?","Os dados atuais deste navegador serão substituídos pelo conteúdo do arquivo.","Importar dados",()=>{
        const old=db;db=imported;db.settings=db.settings||{avoidRematches:true};
        for(const session of db.sessions) { session.undoStack=session.undoStack||[];session.history=session.history||[]; }
        try{db.sessions.filter(s=>s.status!=="finished").forEach(validateSession);}catch(error){db=old;toast("Backup inconsistente: "+error.message,"error");return;}
        saveDb();setView("home");toast("Backup importado com sucesso.");
      },true);
    }catch(error){toast(error.message||"Não foi possível ler o backup.","error");}
    event.target.value="";
  };
  reader.readAsText(file);
}
function exportCsv() {
  const session=getSession();if(!session){toast("Nenhuma sessão selecionada.","error");return;}
  const rows=[["Partida","Data","Dupla A","Dupla B","Vencedores","Perdedores","Entraram"]];
  session.history.forEach(record=>rows.push([record.matchNumber,dateTime(record.playedAt),record.teamA.map(id=>playerName(id,session)).join(" + "),record.teamB.map(id=>playerName(id,session)).join(" + "),record.winnerIds.map(id=>playerName(id,session)).join(" + "),record.loserIds.map(id=>playerName(id,session)).join(" + "),record.entrants.map(id=>playerName(id,session)).join(" + ")]));
  const csv="\uFEFF"+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(";")).join("\r\n");
  downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8;"}),"rei-da-quadra-historico.csv");toast("Histórico exportado em CSV.");
}
function downloadBlob(blob,filename) {
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
function installPwa() {
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;$("#install-button").hidden=false;});
  $("#install-button").addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("#install-button").hidden=true;});
  if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
function init() {
  document.addEventListener("click",event=>{
    const anchor=event.target.closest("a[data-view]");
    if(anchor)event.preventDefault();
  });
  const querySession=new URLSearchParams(location.search).get("session");
  if(querySession&&getSession(querySession))db.activeSessionId=querySession;
  if(!db.activeSessionId&&db.sessions.length) {
    const active=db.sessions.find(s=>s.status==="active"||s.status==="paused");
    if(active)db.activeSessionId=active.id;
  }
  saveDb();installPwa();render();
}
init();
})();