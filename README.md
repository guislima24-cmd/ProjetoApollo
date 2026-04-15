# Apollo — Prospecção automatizada para UFABC Júnior

Aplicação Next.js 16 para o time comercial da UFABC Júnior. Cada membro tem uma aba na planilha comercial; o fluxo novo (`/prospectar`) elimina a digitação manual: o membro cola email/URL do LinkedIn, a IA extrai os dados estruturados, o membro revisa e um clique grava a linha na aba correta da planilha com um pitch personalizado na coluna V.

## Stack

- Next.js 16.2 (App Router) + React 19 + TypeScript
- Tailwind 4
- Google Sheets via `googleapis` (service account)
- Anthropic Claude API (`claude-sonnet-4-5`) — extração via `tool_use` e geração de pitch em texto livre
- Autenticação JWT em cookie httpOnly (`jose`, Edge-compatible)

## Fluxo principal (`/prospectar`)

1. Login em `/login` com `username` + senha (11 credenciais em `MEMBER_CREDENTIALS`).
2. Em `/prospectar`, cola email/URL/contexto → **Analisar com IA**.
3. Revisa os campos extraídos (com badges de confiança alta/média/baixa).
4. **Adicionar à aba "<Membro>"** → grava linha e gera pitch na coluna V.
5. Lista de **Últimos leads** permite **Regerar pitch** com ângulo diferente.

Segurança: `responsavel` vem sempre do JWT, nunca do body. `valueInputOption: 'RAW'` + sanitização de prefixos (`=+-@`) bloqueia injeção de fórmulas no Sheets.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # e preencha os valores
npm run dev
```

Abra http://localhost:3000/login.

## Envs obrigatórias

Veja `.env.example` para o conjunto completo. Em resumo:

| Env | Propósito |
|-----|-----------|
| `GOOGLE_CREDENTIALS_JSON` **ou** `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` | Credenciais do service account do Google Sheets. Prefira o JSON inteiro — é mais robusto ao colar no Vercel. |
| `GOOGLE_SHEETS_ID` | ID da planilha do pipeline (aba "Leads"). |
| `GOOGLE_MEMBER_SHEETS_ID` | ID da planilha comercial com as 11 abas por membro. Se omitido, cai pra `GOOGLE_SHEETS_ID`. |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic (Claude). |
| `JWT_SECRET` | 32+ chars aleatórios — `openssl rand -hex 32`. |
| `MEMBER_CREDENTIALS` | Pares `username:sha256hex` separados por `\|` (ver abaixo). |
| `RESEND_API_KEY` | (Opcional) Envio de email em `/api/send`. |

## Gerando os hashes de senha

O hash é `SHA-256(senha + JWT_SECRET)`. Use o utilitário:

```bash
JWT_SECRET="..." node scripts/hash-password.mjs anna "senha-da-anna"
# → anna:3f2a...
```

Monte `MEMBER_CREDENTIALS` concatenando com `|`:

```
MEMBER_CREDENTIALS="anna:3f2a...|daniel:9bca...|gui-lima:1d3e...|..."
```

Usernames válidos (case-insensitive, sem acento): `anna, daniel, duda, felipe, gui-lima, gui-midolli, gustavo, larissa, leo, leticia, tiago`.

⚠️ Se o `JWT_SECRET` mudar, **todos** os hashes têm que ser regerados (e os cookies existentes ficam inválidos).

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/login` | — | Valida credenciais, seta cookie `apollo_session`. Rate limit 5/15min/IP. |
| POST | `/api/auth/logout` | — | Limpa cookie. |
| GET  | `/api/auth/me` | cookie | `{ responsavel }`. |
| POST | `/api/member-leads/analyze` | cookie | Extrai `{nome, cargo, empresa, setor, alvo, confianca}` via Claude tool_use. |
| POST | `/api/member-leads` | cookie | Grava linha + gera pitch + escreve coluna V. |
| GET  | `/api/member-leads/recent?n=10` | cookie | Últimos N leads da aba do membro logado. |
| POST | `/api/member-leads/regenerate` | cookie | Regera pitch com ângulo diferente, reescreve coluna V. |
| GET  | `/api/member-leads/debug` | whitelist | Diagnóstico das envs do Sheets (sem vazar a chave). |

## Deploy (Vercel)

1. Configure as envs acima no projeto.
2. Compartilhe a planilha comercial com o `client_email` do service account (permissão: Editor).
3. Push pra branch → preview → teste o fluxo end-to-end com um lead real.

## Roadmap

- **Fase 2** — Gmail OAuth por membro: detecta email enviado, pré-popula lead pendente de confirmação.
- **Fase 3** — Chrome Extension que lê DOM de perfis do LinkedIn e envia pro `/api/member-leads/analyze`.
