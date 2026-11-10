# Contrato técnico do Confin

Referência única para quem implementa telas. Proposta funcional: https://claude.ai/artifact/LcnFdG9WKK3UshrGAUJSmq

## Stack

- React 19 + TypeScript + Vite 7, SPA estática com `HashRouter` (rotas em `#/...`).
- Tailwind CSS 4 (tokens em `src/index.css`), ícones `lucide-react` 1.x, gráficos `recharts` 3.
- Dados: `@supabase/supabase-js` 2 (cliente sem tipos gerados) + `@tanstack/react-query` 5.
- Datas: `date-fns` 4 com `ptBR` de `date-fns/locale`.
- Não adicione dependências novas.

## Estrutura

```
src/
  types.ts                  tipos de domínio (espelham o SQL)
  lib/                      supabase, format, period, rules, errors, icons, accounts, categories
  context/                  AuthContext (sessão), GroupContext (grupo ativo), UIContext (tema, ocultar valores, folha de lançamento, toast)
  hooks/queries.ts          leituras compartilhadas + chaves do React Query + useInvalidateFinance
  components/ui/            Button, Card, Field/Input/Select/Textarea/Switch, Sheet, ConfirmDialog, Money/TxAmount, PageHeader, EmptyState, Segmented, ListItem, ColorDot, Spinner/Skeleton
  components/               TransactionRow, PeriodSwitcher (+ usePeriodParam, useMonthStartDay), layout/AppLayout
  features/transactions/    mutations.ts (gravar, parcelar, excluir, desfazer, confirmar) + TransactionSheet
  pages/                    uma tela por arquivo (export default)
supabase/migrations/        esquema, RLS, funções e pg_cron
```

## Regras de negócio (não reimplemente: use `src/lib/rules.ts`)

- Valores em centavos inteiros e positivos; o `type` (`income`, `expense`, `transfer`) dá o sinal.
- **Efetivado** = `status = 'posted'` e `date <= hoje`. Só efetivados entram em saldo e totais.
- **Agendado** = `posted` com data futura (parcelas futuras). Efetiva sozinho na data.
- **Previsto** = `status = 'planned'` (gerado por recorrência). Usuário confirma com `useConfirmTransaction`.
- Transferência é um lançamento só (`account_id` → `to_account_id`), sem categoria, fora de entradas/saídas/% por categoria.
- % por categoria = saídas efetivadas da categoria no período ÷ total de saídas efetivadas do período. Subcategorias somam na categoria principal (`topLevelId`).
- Saldo de conta vem da view `account_balances` (já mesclado em `useAccounts()` como `balance_cents`).
- Cartão de crédito é uma conta `credit_card` (com `closing_day` e `due_day`). Compra = saída no cartão; pagamento da fatura = transferência de outra conta para o cartão. Saldo negativo = fatura em aberto.
- Aporte em investimento = transferência para conta `investment`.
- Mês financeiro começa em `currentGroup.month_start_day` (1 a 28). Use `getPeriod`/`shiftPeriod`/`lastPeriods` de `lib/period.ts` e `useMonthStartDay()`; nunca assuma mês do calendário.
- Datas sempre como `YYYY-MM-DD` locais: `todayISO()`, `toISODate()`, `parseISODate()` de `lib/format.ts`. Nunca `new Date().toISOString().slice(0, 10)` (dá o dia errado à noite no Brasil).
- Tudo do grupo é visível e editável por todos os membros. Gastos pessoais = outro grupo (ex.: "Meus gastos").

## Banco (Supabase)

- Tabelas: `profiles`, `groups`, `group_members`, `group_invites`, `accounts`, `categories`, `recurrences`, `transactions`, `audit_log`, `plan_blocks`, `investments`, `investment_values`, `push_subscriptions`, `notification_log` (só o job), `transaction_attachments`, `goals`; view `account_balances`. `transactions.import_id` é único por conta (importação). Armazenamento: bucket privado `receipts`.
- RPCs: `create_group(p_name) → uuid`, `create_invite(p_group) → code`, `accept_invite(p_code) → group_id`, `generate_recurrences(p_group, p_horizon_days) → int` (helper `generateRecurrences(groupId)` em `hooks/queries.ts`), `save_plan(p_group, p_blocks, p_categories)` (use `useSavePlan()`), `account_balances_at(p_group, p_dates)` (use `useAccountBalancesAt(dates)`), `group_tags(p_group)` (use `useGroupTags()`), `register_push(...)` (use `enablePush()` de `lib/push.ts`), `delete_group(p_group)`, `delete_my_account()`.
- `created_by`, `updated_by` e datas são preenchidos pelo banco. Não envie esses campos.
- Grupos só são criados por `create_group`; membros só entram por `create_group`/`accept_invite`.
- Excluir conta com lançamentos falha (FK): ofereça arquivar (`archived = true`). Idem categoria (exclusão deixa os lançamentos sem categoria; prefira arquivar).
- Ao criar/editar/pausar recorrência, o banco remove os previstos futuros dela; depois chame `generateRecurrences(groupId)` e `useInvalidateFinance()`.
- Erros: mostre `errorMessage(err)` de `lib/errors.ts` num `toast(msg, { tone: 'error' })`.

## Dados no app

- Leituras: `useAccounts`, `useCategories`, `useMembers`, `useInvites`, `useTransactions(filters)`, `useRecurrences`, `usePlanBlocks`, `useInvestments`, `useInvestmentValues`, `useInvestmentFlows`, `useAccountBalancesAt(dates)`, `useGroupTags`, `useGoals` (`hooks/queries.ts`). `useTransactions` aceita `tag`.
- Depois de escrever em lançamentos, contas ou recorrências: `await useInvalidateFinance()()`. Para categorias: `queryClient.invalidateQueries({ queryKey: ['categories'] })`; membros: `['members']`; convites: `['invites']`.
- Grupo ativo: `useGroup()` (`currentGroup`, `isOwner`, `memberships`, `setCurrentGroupId`, `refresh`) e `useGroupId()` dentro das telas logadas.
- Rótulo de conta: `accountLabel(account, members)` → "Erick - Nubank" (titular nulo = "Conjunta").

## Navegação e parâmetros entre telas

| Rota | Parâmetros |
| --- | --- |
| `/` | Início (painel) |
| `/extrato` | `?periodo=YYYY-MM-DD` (início do período, via `usePeriodParam`), `?conta=<id>`, `?categoria=<id>` (inclui subcategorias), `?tipo=income\|expense\|transfer`, `?situacao=previsto`, `?membro=<userId>` (titular da conta), `?tag=<tag>` |
| `/relatorios` | `?periodo=YYYY-MM-DD` |
| `/investimentos` | Carteira; `?nova=1` abre o cadastro de aplicação, `?atualizar=1` abre "Atualizar valores" |
| `/investimentos/:id` | Detalhe da aplicação |
| `/agenda` | Contas a pagar e a receber (previstos, agendados e faturas dos próximos 30 dias, e atrasados) |
| `/previsao` | Projeção do saldo disponível (até 180 dias) |
| `/notificacoes` | Ativar notificações neste aparelho e escolher os avisos (o card "Avisos" do Início leva para cá) |
| `/metas` | Metas de economia |
| `/importar` | Importar extrato OFX ou CSV; `?conta=<id>` já escolhe a conta |
| `/planejamento` | `?periodo=YYYY-MM-DD`; `?editar=1` abre o editor do plano |
| `/mais` | Grupo, membros, convites, mês financeiro, tema, perfil, sair |
| `/contas` | Lista e cadastro de contas |
| `/contas/:id/fatura` | Fatura do cartão; `?fatura=YYYY-MM-DD` (data de fechamento) opcional |
| `/categorias` | Lista, cadastro e orçamento mensal |
| `/recorrencias` | `?nova=1` abre o formulário de nova recorrência |
| `/onboarding` | Criar grupo ou entrar com código; `?novo=1` quando já tem grupo e quer outro |
| `/convite/:code` | Guarda o código em `localStorage['confin.pendingInvite']` e segue para cadastro ou onboarding |
| `/entrar`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha` | Acesso |

- Nova transação de qualquer tela: `useUI().openTransactionSheet({ defaults })`; editar: `openTransactionSheet({ transaction })`.
- Pagar fatura: `openTransactionSheet({ defaults: { type: 'transfer', to_account_id: cardId, amount_cents, date, description } })`.

## Planejamento (Fase 3)

Regras e cálculos em `src/features/planning/plan.ts` (não reimplemente):
- O plano do grupo é uma lista de blocos (`plan_blocks`) que somam 100% da renda do período. Bloco `spend` é limite de gastos; `invest` é meta de aporte.
- Cada categoria de saída de primeiro nível aponta para um bloco (`categories.plan_block_id`); subcategorias contam pela pai. Use `plannableCategories()`.
- Renda do período = entradas efetivadas + agendadas + previstas, fora contas de investimento. Bloco planejado = renda × percentual.
- Aportes líquidos (transferências para contas de investimento menos resgates) contam no primeiro bloco `invest`.
- `planSummary(txs, blocks, categories, accounts)` dá planejado, feito (efetivado), a caminho (agendado + previsto), nível (`ok | warning | over | reached`) e gastos por categoria de cada bloco, além do aporte sugerido do período (`suggestedInvest`) e do já aportado (`investedDone`).
- Alertas: `planAlerts(summary)` (blocos de gasto a partir de 80% ou estourados; vazio sem renda).
- Editor: rascunho `PlanDraft` criado por `draftFromTemplate` (modelos em `PLAN_TEMPLATES`), `draftBlank` ou `draftFromPlan`; `validateDraft` diz o que impede salvar; `useSavePlan()` grava tudo de uma vez (rascunho sem blocos remove o plano). Depois de salvar, as listas de blocos e categorias já são atualizadas pela mutação.

## Patrimônio e investimentos (Fase 4)

Regras e cálculos em `src/features/investments/portfolio.ts` (não reimplemente; leia o comentário do topo):
- Aplicação (`investments`) fica numa conta do tipo investimento e tem posição de abertura (data, valor de mercado, custo). Valores de mercado ficam em `investment_values` (um por dia; gravar de novo no mesmo dia substitui).
- Aportes, resgates, proventos e custos são lançamentos comuns com `investment_id`: aporte = transferência para a conta da aplicação, resgate = transferência saindo dela, provento = entrada na conta, custo = saída na conta. `flowKind(tx, inv)` diz o papel. O banco desfaz o vínculo se o lançamento não usar a conta da aplicação.
- `positionAt` (valor, aplicado, proventos, lucro, rentabilidade simples), `portfolio` (carteira de hoje, dinheiro parado e alocação por classe), `netWorthSeries` (patrimônio por data: passe as mesmas datas de `useAccountBalancesAt`, sempre até hoje).
- Gravações: `useSaveInvestment`, `useDeleteInvestment`, `useSaveInvestmentValues` (vários de uma vez), `useDeleteInvestmentValue` em `features/investments/mutations.ts`. Lançamentos continuam pelas mutações de lançamentos (`investment_id` faz parte de `TransactionInput`).
- Rótulos e cores por classe: `INVESTMENT_CLASS_LABELS`, `INVESTMENT_CLASS_OPTIONS`, `INVESTMENT_CLASS_COLORS`, `FLOW_KIND_LABELS`.

## Previsão e avisos (Fase 5)

- Previsão e agenda: `src/features/forecast/forecast.ts` (leia o comentário do topo). `buildForecast` projeta o saldo disponível (contas fora de investimento; cartão entra negativo) dia a dia; `balanceOn` lê uma data; `buildAgenda` separa atrasados, hoje, 7 dias, depois e faturas, com totais a pagar e a receber.
- Tags: `transactions.tags` (texto livre; o banco põe em minúsculas, tira repetidas e limita a 10 de 30 caracteres). Sugestões: `useGroupTags()`. Filtro: `useTransactions({ tag })`.
- CSV: `transactionsToCsv(txs, { accounts, categories, members })` + `downloadCsv(nome, texto)`; para tudo do grupo, `fetchAllTransactions(groupId)` (pagina de 1000 em 1000) em `src/features/export/csv.ts`.
- Notificações: `src/lib/push.ts` (`getPushState`, `enablePush`, `disablePush`, `showTestNotification`). Preferências em `profiles.notify_bills` e `profiles.notify_budget` (a própria pessoa atualiza o perfil). Quem envia é o job diário `.github/workflows/notify.yml` (`scripts/notify.ts`), por volta das 8h; no iPhone só funciona com o app instalado na tela de início.
- Excluir grupo: `supabase.rpc('delete_group', { p_group })`. Excluir a própria conta: `supabase.rpc('delete_my_account')` e depois sair (grupos onde a pessoa está sozinha são apagados; nos outros, ela sai e as contas dela viram conjuntas).

## Comprovantes (Fase 6)

Tudo em `src/features/attachments/attachments.ts` (leia o comentário do topo):
- Arquivo no bucket privado `receipts` (`<group_id>/<transaction_id>/<uuid>.<ext>`) + linha em `transaction_attachments`. Aceita fotos e PDF até 10 MB; `prepareFile` reduz fotos para JPEG de até 1600 px. `ATTACHMENT_ACCEPT` é o accept do input de arquivo.
- Leituras: `useAttachments(transactionId)`, `useAttachmentCounts(ids)` (Map id → quantidade). Gravações: `useAddAttachment()` (`{ groupId, transactionId, file }`, um arquivo por chamada), `useDeleteAttachment()`. Abrir: `attachmentUrl(a, download?)` = link assinado de 5 min.
- O banco não apaga arquivos. `useDeleteTransaction` já remove os arquivos dos lançamentos excluídos; antes de `delete_group`, chame `removeGroupAttachmentFiles(groupId)`. Desfazer a exclusão de um lançamento não traz os comprovantes de volta.

## Metas e modo offline (Fase 7)

- Metas: `src/features/goals/goals.ts` — `goalStatus(goal, { accounts, positions })` (progresso, falta, aporte mensal sugerido, atrasada, vínculo removido), `GOAL_KIND_LABELS`, `useSaveGoal`, `useDeleteGoal`, `useAdjustGoalSaved` (só metas manuais). `positions` vem de `portfolio(...)` (investimentos).
- Offline (só leitura): `src/lib/offline.ts`. O cache do React Query fica no aparelho por 7 dias e é apagado ao sair da conta; sem internet as telas mostram o cache e gravar falha com "Sem conexão". Use `useOnline()` e `lastSyncedAt(queryClient)` para o aviso de offline. Consulta que não deve ir para o cache: inclua a primeira parte da chave em `NOT_PERSISTED`.

## Importar e exportar (Fase 8)

- Ler arquivo: `readImportFile(file)` em `src/features/import/parse.ts` (OFX ou CSV; `csv.mapping` null = pedir as colunas e chamar `applyCsvMapping`). Valores com sinal: + entrada, − saída; `suggestInvert` para faturas com sinal ao contrário.
- Revisar e gravar: `buildReview(rows, { account, invert, existing, history, categories })`, `toTransactionInputs`, `importTransactions` em `src/features/import/review.ts` (leia o comentário do topo: status `new | imported | duplicate | card-payment`). Depois `useInvalidateFinance()`.
- OFX: `transactionsToOfx(account, txs, { from, to }, saldoNoFim)` em `src/features/export/ofx.ts`.
- Relatórios: `buildReport(...)` em `src/features/export/report.ts` gera `ReportData`; `downloadFile(nome, conteúdo, mime)` baixa qualquer arquivo. As bibliotecas de xlsx (`write-excel-file`) e PDF (`jspdf` + `jspdf-autotable`) entram por `import()` dinâmico, só ao exportar.

## Interface

- Mobile first: largura útil até `max-w-lg` (o `AppLayout` já centraliza e reserva espaço para a barra inferior).
- Cores só pelos tokens: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `text-fg`, `text-muted`, `brand-50..900`, `text-income`, `text-expense`, `text-transfer`, `text-invest`. Sempre funcionar no modo escuro.
- Valores sempre por `<Money>`/`<TxAmount>`/`useMoneyText()` (respeitam "ocultar valores").
- Textos de interface e comentários em português do Brasil. Formato R$ 1.234,56 e dd/mm/aaaa.
- Alvos de toque com pelo menos 44 px. Estados de carregando (`Skeleton`), vazio (`EmptyState`) e erro em toda tela.
- Ícones: confira que o nome existe em `node_modules/lucide-react/dist/lucide-react.d.ts` (`declare const Nome:`). Na 1.x vários apelidos sumiram (use `Trash`, `Funnel`, `House`, `CirclePlus`, `Ellipsis`).
- Classes do Tailwind sempre escritas por inteiro (nada de `text-${cor}`).

## Donos dos arquivos

| Frente | Arquivos |
| --- | --- |
| Fundação (Opus) | tudo fora das linhas abaixo |
| Acesso e cadastros | `src/pages/auth/*`, `src/pages/onboarding/*`, `src/pages/More.tsx`, `src/pages/Accounts.tsx`, `src/pages/Categories.tsx`, `src/features/accounts/**`, `src/features/categories/**`, `src/features/groups/**` |
| Lançamentos | `src/features/transactions/**` (exceto mudar assinaturas de `mutations.ts`), `src/pages/Statement.tsx` |
| Painel e relatórios | `src/pages/Home.tsx`, `src/pages/Reports.tsx`, `src/features/dashboard/**`, `src/components/charts/**` |
| Recorrências e cartão | `src/pages/Recurrences.tsx`, `src/pages/CardStatement.tsx`, `src/features/recurrences/**`, `src/features/cards/**`, `src/lib/card.ts` |
| Planejamento | `src/pages/Planning.tsx`, `src/features/planning/**` (exceto mudar `plan.ts` e `mutations.ts`) |
| Investimentos | `src/pages/Investments.tsx`, `src/pages/InvestmentDetail.tsx`, `src/features/investments/**` (exceto mudar `portfolio.ts` e `mutations.ts`) |
| Tags e CSV no extrato | `src/features/tags/**`, `src/pages/Statement.tsx`, `src/pages/Reports.tsx`, `src/features/transactions/TransactionForm.tsx`, `src/components/TransactionRow.tsx` |
| Agenda, previsão, notificações e conta | `src/pages/Agenda.tsx`, `src/pages/Forecast.tsx`, `src/features/notifications/**`, `src/pages/More.tsx`, `src/pages/Home.tsx`, `src/App.tsx` |
| Comprovantes | `src/features/attachments/**` (exceto mudar `attachments.ts`), `src/features/transactions/TransactionForm.tsx`, `src/features/transactions/TransactionSheet.tsx`, `src/components/TransactionRow.tsx`, `src/pages/Statement.tsx`, `src/pages/More.tsx` (exclusão do grupo) |
| Metas e offline | `src/pages/Goals.tsx`, `src/features/goals/**` (exceto mudar `goals.ts`), `src/features/offline/**`, `src/pages/Home.tsx`, `src/components/layout/AppLayout.tsx` |
| Importar e exportar | `src/pages/Import.tsx`, `src/features/import/**` (exceto mudar `parse.ts` e `review.ts`), `src/features/export/**` (exceto mudar `csv.ts`, `ofx.ts` e `report.ts`), `src/pages/Reports.tsx`, `src/pages/More.tsx` |
| Infra | `.github/workflows/*`, `scripts/*`, `README.md` |

Precisa mudar um arquivo compartilhado? Não mude: descreva a mudança no relatório final.
