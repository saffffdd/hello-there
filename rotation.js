(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReiDaQuadraRotation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function unique(ids) { return new Set(ids).size === ids.length; }

  // Pure transaction builder: losers join the queue tail but are not eligible
  // for the immediately following match.
  function buildNextRotation(state, loserSide, selectedEntrants) {
    if (loserSide !== "A" && loserSide !== "B") throw new Error("A dupla perdedora precisa ser A ou B.");
    const teamA=state.teamA.slice(), teamB=state.teamB.slice(), reserve=state.reserve.slice();
    const winnerIds=(loserSide==="A"?teamB:teamA).slice();
    const loserIds=(loserSide==="A"?teamA:teamB).slice();
    const selected=Array.isArray(selectedEntrants)?selectedEntrants.slice():[];
    if(reserve.length<2) throw new Error("São necessários dois jogadores na reserva para fazer a rotação.");
    if(selected.length!==2||!unique(selected)) throw new Error("A próxima dupla precisa ter exatamente dois jogadores distintos.");
    if(!selected.every(id=>reserve.includes(id))) throw new Error("Os próximos jogadores devem vir exclusivamente da reserva atual.");
    if(selected.some(id=>winnerIds.includes(id))) throw new Error("Um vencedor não pode ser selecionado novamente como desafiante.");
    const nextTeamA=loserSide==="B"?winnerIds:selected;
    const nextTeamB=loserSide==="A"?winnerIds:selected;
    const nextReserve=reserve.filter(id=>!selected.includes(id)).concat(loserIds);
    const nextCourt=nextTeamA.concat(nextTeamB), allBefore=teamA.concat(teamB,reserve), allAfter=nextCourt.concat(nextReserve);
    if(nextCourt.length!==4||!unique(nextCourt)) throw new Error("A próxima partida precisa ter quatro jogadores distintos.");
    if(nextCourt.some(id=>nextReserve.includes(id))||!unique(nextReserve)) throw new Error("A quadra e a reserva não podem conter jogadores duplicados.");
    if(!unique(allBefore)||allBefore.length!==allAfter.length||allBefore.some(id=>!allAfter.includes(id))||allAfter.some(id=>!allBefore.includes(id))) {
      throw new Error("A rotação não preservou exatamente os participantes da sessão.");
    }
    return {teamA:nextTeamA,teamB:nextTeamB,reserve:nextReserve};
  }
  return {buildNextRotation};
});
