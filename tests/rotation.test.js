// Testes sem dependências: node tests/rotation.test.js
const assert = require("node:assert/strict");

function unique(ids) { return new Set(ids).size === ids.length; }
function rotate(state, loserSide, entrants) {
  const winner = loserSide === "A" ? state.teamB : state.teamA;
  const loser = loserSide === "A" ? state.teamA : state.teamB;
  const pool = state.reserve.concat(loser);
  const selected = entrants || pool.slice(0, 2);
  assert.equal(selected.length, 2, "dois desafiantes");
  assert.equal(new Set(selected).size, 2, "desafiantes distintos");
  assert.ok(selected.every(id => pool.includes(id)), "desafiantes precisam estar na reserva");
  const reserve = pool.filter(id => !selected.includes(id));
  const court = winner.concat(selected);
  assert.equal(court.length, 4);
  assert.ok(unique(court), "ninguém pode aparecer duas vezes em quadra");
  assert.ok(unique(reserve), "reserva sem duplicados");
  assert.equal(court.length + reserve.length, state.teamA.length + state.teamB.length + state.reserve.length);
  return {teamA:winner, teamB:selected, reserve};
}

const initial = {teamA:["a","b"],teamB:["c","d"],reserve:["e","f","g","h"]};
const next = rotate(initial,"B",["e","f"]);
assert.deepEqual(next.teamA,["a","b"],"vencedores permanecem");
assert.deepEqual(next.teamB,["e","f"],"desafiantes entram");
assert.deepEqual(next.reserve,["g","h","c","d"],"perdedores vão para o fim da fila");
assert.equal(next.teamA.length + next.teamB.length + next.reserve.length,8);

const four = {teamA:["a","b"],teamB:["c","d"],reserve:[]};
const fourNext = rotate(four,"A",["a","b"]);
assert.deepEqual(fourNext.teamA,["c","d"]);
assert.deepEqual(fourNext.teamB,["a","b"]);
assert.deepEqual(fourNext.reserve,[]);

assert.throws(() => rotate(initial,"A",["a","e"]), /precisam estar na reserva/);
assert.throws(() => rotate(initial,"A",["e","e"]), /desafiantes distintos/);
console.log("OK: rotação, fila, quatro jogadores e validações básicas.");
