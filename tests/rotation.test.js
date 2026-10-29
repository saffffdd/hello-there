// Testes da mesma função pura usada pelo aplicativo: node tests/rotation.test.js
const assert=require("node:assert/strict");
const {buildNextRotation}=require("../rotation.js");
function unique(ids){return new Set(ids).size===ids.length;}
function checkPartition(before,after){
  const beforeIds=before.teamA.concat(before.teamB,before.reserve);
  const afterIds=after.teamA.concat(after.teamB,after.reserve);
  assert.equal(after.teamA.length+after.teamB.length,4,"quadra com quatro jogadores");
  assert.ok(unique(after.teamA.concat(after.teamB)),"quadra sem duplicações");
  assert.ok(unique(after.reserve),"reserva sem duplicações");
  assert.ok(after.teamA.concat(after.teamB).every(id=>!after.reserve.includes(id)),"ninguém simultaneamente na quadra e na reserva");
  assert.equal(afterIds.length,beforeIds.length,"total de participantes preservado");
  assert.ok(unique(beforeIds),"estado inicial sem duplicações");
  assert.ok(beforeIds.every(id=>afterIds.includes(id))&&afterIds.every(id=>beforeIds.includes(id)),"nenhum participante perdido ou duplicado");
}
const example={teamA:["João","Pedro"],teamB:["Rodrigo","Camila"],reserve:["Ana","Lucas","Bruno","Julia"]};
// Regressão obrigatória: a dupla B perde e Camila não pode voltar à quadra.
const next=buildNextRotation(example,"B",["Ana","Lucas"]);
assert.deepEqual(next.teamA,["João","Pedro"],"a dupla vencedora permanece");
assert.deepEqual(next.teamB,["Ana","Lucas"],"entram dois jogadores elegíveis da reserva");
assert.deepEqual(next.reserve,["Bruno","Julia","Rodrigo","Camila"],"perdedores vão para o fim da fila");
assert.ok(!next.teamA.concat(next.teamB).includes("Camila"),"Camila não pode continuar na quadra");
assert.ok(!next.teamA.concat(next.teamB).includes("Rodrigo"),"Rodrigo não pode continuar na quadra");
checkPartition(example,next);
// Cobertura da outra dupla perdedora.
const reverse=buildNextRotation(example,"A",["Bruno","Julia"]);
assert.deepEqual(reverse.teamA,["Bruno","Julia"]);
assert.deepEqual(reverse.teamB,["Rodrigo","Camila"]);
assert.deepEqual(reverse.reserve,["Ana","Lucas","João","Pedro"]);
checkPartition(example,reverse);
// Nunca permitir seleção da dupla perdedora, duplicatas ou escolha incompleta.
assert.throws(()=>buildNextRotation(example,"B",["Camila","Ana"]),/exclusivamente da reserva/);
assert.throws(()=>buildNextRotation(example,"B",["Rodrigo","Camila"]),/exclusivamente da reserva/);
assert.throws(()=>buildNextRotation(example,"B",["Ana","Ana"]),/dois jogadores distintos/);
assert.throws(()=>buildNextRotation(example,"B",["Ana"]),/dois jogadores distintos/);
// Sem dois jogadores na reserva, não se registra uma rotação inválida.
assert.throws(()=>buildNextRotation({teamA:["A","B"],teamB:["C","D"],reserve:[]},"B",["C","D"]),/dois jogadores na reserva/);
assert.throws(()=>buildNextRotation({teamA:["A","B"],teamB:["C","D"],reserve:["E"]},"A",["E","B"]),/dois jogadores na reserva/);
assert.throws(()=>buildNextRotation(example,"B",["João","Ana"]),/exclusivamente da reserva/);
console.log("OK: vencedor permanece, dupla perdedora sai, reserva exclusiva, fila preservada e sem duplicações.");
