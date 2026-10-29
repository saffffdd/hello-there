# Implementação do Lovable Cloud — Rei da Quadra

> Cole o prompt abaixo no chat do projeto no Lovable. O Lovable precisa executar a ativação do Cloud e as migrações no próprio projeto; editar apenas o GitHub não consegue provisionar o banco gerenciado.

## Prompt para o Lovable

Quero integrar completamente o projeto existente **Rei da Quadra** ao **Lovable Cloud (backend nativo do Lovable)**. Use o banco PostgreSQL gerenciado pelo Lovable Cloud, não crie um projeto Supabase externo e não deixe a aplicação funcionando somente com localStorage.

Antes de alterar, examine o código atual sincronizado do GitHub e preserve a identidade visual e as regras de jogo já implementadas.

### Requisitos obrigatórios

1. **Ative/conecte o Lovable Cloud neste projeto** e crie as tabelas por migrações gerenciadas pelo Lovable. Se a ativação exigir uma confirmação minha na interface, solicite-a e aguarde; não simule que o banco foi criado.
2. **Adapte a aplicação existente ao backend Cloud.** O repositório atual usa HTML/CSS/JavaScript sem build e persiste o estado em localStorage. Migre a estrutura necessária para o formato suportado pelo Lovable Cloud e integre o cliente oficial gerado pelo próprio Lovable. Não coloque credenciais secretas no frontend nem invente URL/chaves. Não basta criar SQL ou documentação.
3. **Autenticação:** implemente login e cadastro por e-mail com sessão persistente, recuperação de senha se disponível e logout. Dados administrativos devem ser acessíveis apenas ao proprietário autenticado.
4. **Banco e relacionamentos:** crie tabelas adequadas para perfis/usuários, jogadores, sessões, participantes da sessão, partidas e tokens de compartilhamento. Inclua IDs UUID, timestamps, chaves estrangeiras, índices e restrições. Armazene estado de partida de forma consistente; evite manter cópias divergentes do histórico e do estado atual sem validação.
5. **Segurança/RLS:** ative Row Level Security em todas as tabelas. Usuários autenticados só podem administrar seus próprios jogadores e sessões. Participantes não ganham acesso administrativo por estarem numa sessão. Não permita leitura pública das tabelas privadas nem exponha service-role/segredos.
6. **Compartilhamento de sessão:** implemente um link público com token aleatório, revogável, que mostre apenas a sessão explicitamente compartilhada e em modo somente leitura. Use função server-side/Edge Function ou mecanismo seguro equivalente do Lovable Cloud para validar o token e retornar somente os dados necessários. Não coloque UUIDs secretos ou estado administrativo no link.
7. **Persistência real:** jogadores, sessões, fila, duplas, partidas, resultados, estatísticas, pausas, encerramento e desfazer precisam sobreviver a logout, troca de navegador e acesso por outro dispositivo após autenticação. Grave alterações no banco e apresente erros de rede de forma clara. Evite sucesso visual antes da confirmação do servidor.
8. **Consistência de partidas:** resultado + rotação + histórico devem ser registrados atomicamente no servidor, idealmente com RPC/função transacional, proteção contra partidas duplicadas e validação do número/estado atual da partida. Desfazer deve também ser seguro e consistente.
9. **Migração de dados locais:** mantenha opção de exportar backup JSON/CSV. Ofereça importação explícita do backup local para a conta autenticada, com prévia e validação; nunca sobrescreva ou envie dados automaticamente sem consentimento. Mantenha modo offline apenas como cache/recuperação, não como fonte de verdade quando autenticado.
10. **Tempo real (se suportado):** atualize a visualização somente leitura compartilhada quando a sessão muda, sem permitir que visitantes alterem o jogo.
11. **Interface:** preserve o layout mobile-first, navegação, sorteio, regra “vencedores ficam; perdedores vão para a reserva; entram dois desafiantes”, edição dos jogadores, histórico, estatísticas, desfazer, PWA e acessibilidade. Adicione estados de carregamento, vazio, erro e reconexão.
12. **Testes:** crie/atualize testes para autenticação e permissões, RLS, rotação, concorrência/duplicação de resultado, desfazer, token de compartilhamento revogado e importação de backup. Rode os testes disponíveis e informe exatamente o que passou e o que não foi testado.

### Critérios de aceite

- Duas sessões de navegador/dispositivos diferentes autenticadas na mesma conta veem os mesmos dados do servidor.
- Uma conta não consegue ler ou modificar dados de outra.
- Um visitante sem login só vê a sessão se tiver um token válido e apenas em modo leitura.
- Resultado e rotação não são duplicados por cliques repetidos nem ficam parcialmente gravados.
- Sem conexão, a UI não finge que os dados foram sincronizados.
- Não use dados simulados, tabelas falsas ou chaves placeholder como se fossem uma integração concluída.

Primeiro ative o Lovable Cloud e mostre as migrações/alterações de segurança propostas. Depois implemente o frontend e backend, execute os testes e me informe quaisquer etapas que ainda dependam de aprovação minha.
