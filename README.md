# Rei da Quadra — Beach Tennis

Aplicação web mobile-first para organizar partidas 2x2 no formato Rei da Quadra.

## Recursos implementados

- Cadastro, busca, edição e remoção de jogadores.
- Criação de sessão com sorteio inicial ou seleção manual dos quatro jogadores em quadra.
- Sorteio com aleatoriedade criptográfica quando disponível e preferência configurável por variedade de parceiros e confrontos.
- Rotação automática: vencedores permanecem; perdedores vão ao fim da reserva; dois desafiantes entram.
- Validações de participantes, quadra e reserva para evitar jogadores duplicados ou perdidos.
- Confirmação antes de registrar resultado, pausa, retomada, encerramento e desfazer a última partida.
- Histórico de partidas e estatísticas individuais calculadas com os resultados registrados.
- Persistência automática no navegador via localStorage.
- Exportação CSV e backup JSON com importação.
- Manifesto, ícone e service worker para instalação como PWA em hospedagem HTTPS.

## Lovable Cloud (banco na nuvem)

O app original é HTML/CSS/JavaScript estático e, no momento, usa `localStorage`. **A publicação sozinha não transforma esse armazenamento em banco compartilhado.** O Lovable Cloud precisa ser ativado no próprio projeto Lovable e o código precisa ser integrado ao backend gerenciado.

Há um guia com um prompt de implementação completo, incluindo autenticação, tabelas, RLS, persistência entre dispositivos, compartilhamento seguro e testes:

- [Abrir LOVABLE_CLOUD_SETUP.md](./LOVABLE_CLOUD_SETUP.md)

Abra o projeto no Lovable, ative o Cloud/backend pela interface quando solicitado e cole o prompt desse arquivo no chat do projeto. O Lovable precisa executar as migrações no backend do projeto; não basta adicionar SQL ao GitHub. Não coloque chaves secretas no frontend.

## Executar localmente

O modo local não precisa de build nem de dependências. Abra `index.html`. Para testar o PWA/service worker, rode um servidor local:

```bash
python -m http.server 8080
```

Acesse http://localhost:8080.

## Persistência atual e limitações

- Antes da integração do Lovable Cloud, os dados ficam apenas no navegador/dispositivo atual.
- O botão de compartilhar no modo local não publica os dados da sessão para outros dispositivos.
- Exporte um backup JSON em Configurações antes de mudar de dispositivo ou ambiente.
- O arquivo `supabase-schema.sql` é apenas um esquema inicial para quem escolher um projeto Supabase próprio; ele não configura o Lovable Cloud e não ativa sincronização.

## Testes de regras

Com Node.js instalado:

```bash
node tests/rotation.test.js
```

## Publicação

Publique pelo Lovable após sincronizar as alterações e concluir a configuração do backend. A integração com o banco deve ser validada no ambiente publicado, em dois navegadores/dispositivos, antes de usar como fonte oficial dos jogos.
