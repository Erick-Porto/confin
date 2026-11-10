# Confin

Controle financeiro da família. Grupos (ex.: FinPorto), contas com titular (ex.: Erick - Nubank), entradas, saídas, transferências, recorrências, % de gastos por categoria, fatura do cartão, parcelas e orçamento mensal.

- Proposta funcional: https://claude.ai/artifact/LcnFdG9WKK3UshrGAUJSmq
- Contrato técnico: [`docs/CONTRATO.md`](docs/CONTRATO.md)

## Status

- Fases 0, 1, 2, 3 (planejamento: modelos como o 50/30/20, regras próprias, planejado x realizado e aporte sugerido), 4 (investimentos: aplicações por classe, aportes, resgates, proventos, rentabilidade, alocação e evolução do patrimônio) 5 (previsão de saldo, contas a pagar e receber, notificações, tags, exportar CSV e excluir a conta) e 6 (comprovantes: fotos e PDFs nos lançamentos, guardados no bucket privado `receipts` do Supabase; o plano gratuito tem 1 GB), 7 (metas e modo offline só leitura) e 8 (importar extrato OFX/CSV, exportar OFX e relatórios em xlsx e PDF) implementadas.
- Testes automatizados e a bateria de testes: pendentes; serão feitos ao final, com autorização.

## Stack

- React 19 + TypeScript
- Vite 7 e Tailwind CSS 4
- React Query e Recharts
- Supabase: Auth + Postgres com RLS + pg_cron
- GitHub Actions + GitHub Pages
- PWA (instalável no celular)

## Configurar o Supabase

1. Crie um projeto no [Supabase](https://supabase.com) (o plano gratuito basta).
2. Aplique as migrações de `supabase/migrations/`, de uma das formas:
   - Pelo CLI: `npx supabase login`, `npx supabase link --project-ref <ref>` e `npx supabase db push --remote`.
   - Ou cole os dois arquivos no SQL Editor, nesta ordem: `20261103120000_schema.sql` e depois `20261103120100_cron.sql`.
3. Em **Authentication > URL Configuration**:
   - Site URL: `https://<usuario>.github.io/<repositorio>/`
   - Redirect URLs: `https://<usuario>.github.io/<repositorio>/**` e `http://localhost:5173/**`
4. Em **Authentication > Providers > Email**: mantenha "Confirm email" ligado e defina o tamanho mínimo da senha como 8.
5. Copie o **Project URL** e a **anon key** em **Project Settings > API**.

## Rodar localmente

1. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
2. `npm install`
3. `npm run dev`
4. Abra http://localhost:5173

## Publicar no GitHub Pages

1. Crie o repositório no GitHub e envie o código.
2. Em **Settings > Pages > Source**, escolha **GitHub Actions**.
3. Em **Settings > Secrets and variables > Actions**, crie os secrets:

| Secret | Para que serve |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto. Usada no build do site e no keep-alive. |
| `VITE_SUPABASE_ANON_KEY` | Anon key do projeto (pública por design). Usada no build do site e no keep-alive. |
| `SUPABASE_ACCESS_TOKEN` | Token pessoal do CLI, criado em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens). Usado nas migrações e no backup. |
| `SUPABASE_PROJECT_REF` | Id do projeto (o trecho antes de `.supabase.co` na URL). Usado pelo CLI nas migrações e no backup. |
| `SUPABASE_DB_PASSWORD` | Senha do banco definida ao criar o projeto. Usada nas migrações e no backup. |
| `BACKUP_PASSPHRASE` | Senha longa para criptografar os backups. Guarde em local seguro: sem ela o backup não abre. |
| `VAPID_PRIVATE_KEY` | Chave privada das notificações (par da chave pública em `src/lib/vapid.ts`). Sem ela o job de avisos não envia nada. Para trocar o par: `node -e "console.log(require('web-push').generateVAPIDKeys())"`, atualize os dois lados; os aparelhos precisam ativar de novo. |

4. Envie um commit para `main`. O workflow de deploy publica o site em `https://<usuario>.github.io/<repositorio>/`.

## Workflows

| Arquivo | Quando roda | O que faz |
| --- | --- | --- |
| `ci.yml` | Pull requests e push para `main` | Lint, checagem de tipos, build e testes (se existirem). Não usa secrets. |
| `deploy.yml` | Push para `main` ou manualmente | Gera o build com as variáveis do Supabase e publica no GitHub Pages. |
| `db-migrate.yml` | Push para `main` que altere `supabase/migrations/`, ou manualmente | Aplica no banco as migrações novas (`supabase db push`). |
| `keep-alive.yml` | A cada 3 dias, ou manualmente | Faz uma consulta leve à API para o projeto gratuito não pausar por inatividade. |
| `backup.yml` | Domingos às 02:00 (Brasília), ou manualmente | Gera dump do esquema e dos dados, criptografa com `BACKUP_PASSPHRASE` e guarda como artefato por 90 dias. |
| `notify.yml` | Todo dia às 08:00 (Brasília), ou manualmente | Roda `scripts/notify.ts`: avisa contas que vencem hoje ou amanhã, previstos atrasados, faturas e plano ou orçamento perto do limite, sem repetir aviso. Usa `SUPABASE_DB_PASSWORD` e `VAPID_PRIVATE_KEY`. |

"Manualmente" significa **Actions > nome do workflow > Run workflow**.

## Primeiro acesso

1. Crie sua conta e confirme o e-mail.
2. Crie o grupo **FinPorto** (ele já vem com categorias padrão).
3. Cadastre as contas, cada uma com o titular (ex.: Erick - Nubank).
4. Em **Mais > Convites**, gere um convite e envie o link para sua esposa. O convite vale por 7 dias e só pode ser usado uma vez.
5. Ela cria a conta pelo link e entra no grupo pelo convite.
6. Para gastos pessoais, crie outro grupo, como **Meus gastos**.

## Restaurar um backup

1. Em **Actions**, abra a execução de backup desejada e baixe o artefato `confin-backup-<run_id>`. Dentro dele está `confin-backup-AAAA-MM-DD.tar.gz.gpg`.
2. Descriptografe e extraia:

   ```bash
   gpg --decrypt confin-backup-AAAA-MM-DD.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz
   ```

3. Crie um projeto novo no Supabase e restaure com psql, usando a connection string em **Project Settings > Database**:

   ```bash
   psql "<connection string>" -f backup/schema.sql
   psql "<connection string>" -f backup/data.sql
   ```

   Atenção: o backup não inclui os usuários do Auth (`auth.users`) nem o agendamento do pg_cron. Crie os usuários antes do `data.sql` e recrie o agendamento com o trecho `cron.schedule` de `20261103120100_cron.sql`.

## Cuidados

- GitHub Pages em repositório **privado** exige plano pago (Pro, Team ou Enterprise). No plano gratuito, o repositório precisa ser **público**. Os dados continuam protegidos no Supabase pelo RLS, e a anon key é pública por design.
- Em repositório público, qualquer pessoa pode baixar os artefatos de backup. Por isso eles são criptografados; mesmo assim, guarde bem a `BACKUP_PASSPHRASE`.
- Em repositório público, o GitHub desativa workflows agendados após 60 dias sem commits. Reative-os na aba **Actions**.
- O uso diário do app já conta como atividade para o Supabase; o keep-alive é uma garantia extra.
- O ícone do PWA no iPhone usa o SVG. Talvez seja preciso um PNG `apple-touch-icon` no futuro.
- Nunca coloque a **service role key** no app nem no repositório.

## Estrutura

```
src/
  types.ts          tipos de domínio (espelham o SQL)
  lib/              Supabase, formatação, períodos, regras de negócio, erros, ícones
  context/          sessão, grupo ativo, UI (tema, ocultar valores, toasts)
  hooks/            leituras compartilhadas (React Query)
  components/ui/    botões, campos, cards, folhas, diálogos
  components/       componentes de domínio e layout
  features/         lançamentos, contas, categorias, grupos, recorrências, cartões, painel
  pages/            uma tela por arquivo
supabase/
  config.toml       configuração do CLI
  migrations/       esquema, RLS, funções e pg_cron
docs/CONTRATO.md    referência técnica (regras de negócio, rotas, donos dos arquivos)
```
