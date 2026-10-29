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
- Esquema SQL inicial com RLS em supabase-schema.sql.

## Executar localmente

O modo local não precisa de build nem de dependências. Abra index.html. Para testar o PWA/service worker, rode um servidor local:

```bash
python -m http.server 8080
```

Acesse http://localhost:8080.

## Persistência

O modo local salva os dados apenas no navegador/dispositivo atual. Não existe sincronização automática entre dispositivos. Exporte um backup JSON em Configurações para guardar uma cópia.

## Configurar Supabase

O arquivo supabase-schema.sql fornece tabelas e políticas RLS iniciais. Para uso multiusuário, ainda é necessário configurar um projeto Supabase, autenticação, variáveis SUPABASE_URL e SUPABASE_ANON_KEY, gravações transacionais no servidor e uma Edge Function para compartilhamento público protegido. Nunca exponha a chave service_role no frontend. O SQL sozinho não ativa sincronização em tempo real nem compartilhamento entre dispositivos.

O botão de compartilhar no modo local cria um link com o identificador da sessão, mas não publica os dados locais. O compartilhamento e a sincronização remota só estarão funcionais depois da configuração do backend.

## Testes de regras

Com Node.js instalado:

```bash
node tests/rotation.test.js
```

## Publicação

Publique os arquivos estáticos em uma hospedagem HTTPS, como GitHub Pages, Netlify ou Vercel. Este commit não publica o site automaticamente.
