// Tipos de domínio. Espelham as tabelas de supabase/migrations/20261103120000_schema.sql.
// Datas "YYYY-MM-DD" são strings (ISODate); timestamps são strings ISO.
// Valores monetários são sempre centavos inteiros e positivos (o `type` diz o sinal).

export type ISODate = string;

export type MemberRole = 'owner' | 'member';
export type AccountType = 'checking' | 'savings' | 'wallet' | 'credit_card' | 'investment';
export type CategoryKind = 'income' | 'expense';
export type TxType = 'income' | 'expense' | 'transfer';
export type TxStatus = 'planned' | 'posted';
export type RecurrenceFreq = 'weekly' | 'monthly' | 'yearly';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  /** Dia em que o mês financeiro começa (1 a 28). */
  month_start_day: number;
  created_by: string | null;
  created_at: string;
}

export interface Membership {
  role: MemberRole;
  group: Group;
}

export interface Member {
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile: Profile | null;
}

export interface Invite {
  id: string;
  group_id: string;
  code: string;
  created_by: string | null;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  group_id: string;
  /** Titular. null = conta conjunta. */
  owner_id: string | null;
  name: string;
  institution: string | null;
  type: AccountType;
  initial_balance_cents: number;
  color: string;
  archived: boolean;
  /** Só cartão de crédito. */
  closing_day: number | null;
  /** Só cartão de crédito. */
  due_day: number | null;
  credit_limit_cents: number | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** Conta com o saldo calculado pela view account_balances. */
export interface AccountWithBalance extends Account {
  balance_cents: number;
}

export interface Category {
  id: string;
  group_id: string;
  parent_id: string | null;
  name: string;
  kind: CategoryKind;
  /** Nome do ícone em src/lib/icons.tsx (ex.: "shopping-cart"). */
  icon: string;
  color: string;
  /** Orçamento mensal (Fase 2). Só faz sentido em categorias de saída. */
  monthly_budget_cents: number | null;
  /** Bloco do plano (Fase 3). Só em categorias de saída de primeiro nível; subcategorias seguem a pai. */
  plan_block_id: string | null;
  archived: boolean;
  sort_order: number;
  created_at: string;
}

export type PlanBlockKind = 'spend' | 'invest';

/** Bloco do plano financeiro (Fase 3). Os blocos de um grupo somam 100% da renda. */
export interface PlanBlock {
  id: string;
  group_id: string;
  name: string;
  /** spend = limite de gastos; invest = meta de aporte. */
  kind: PlanBlockKind;
  /** Inteiro de 0 a 100. */
  percent: number;
  color: string;
  sort_order: number;
}

export interface Transaction {
  id: string;
  group_id: string;
  type: TxType;
  status: TxStatus;
  amount_cents: number;
  date: ISODate;
  description: string;
  notes: string | null;
  account_id: string;
  /** Só transferência. */
  to_account_id: string | null;
  /** Sempre null em transferência. */
  category_id: string | null;
  recurrence_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** Campos que o app envia ao criar/editar um lançamento (o resto o banco preenche). */
export interface TransactionInput {
  group_id: string;
  type: TxType;
  status: TxStatus;
  amount_cents: number;
  date: ISODate;
  description: string;
  notes: string | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  recurrence_id?: string | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  installment_total?: number | null;
}

export interface Recurrence {
  id: string;
  group_id: string;
  type: TxType;
  amount_cents: number;
  description: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  freq: RecurrenceFreq;
  /** A cada N semanas/meses/anos (1 a 12). */
  interval_count: number;
  start_date: ISODate;
  end_date: ISODate | null;
  active: boolean;
  generated_until: ISODate | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  group_id: string;
  table_name: string;
  record_id: string;
  action: 'insert' | 'update' | 'delete';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

/** Filtros aceitos por useTransactions (src/hooks/queries.ts). */
export interface TransactionFilters {
  /** Data inicial, inclusiva. */
  from?: ISODate;
  /** Data final, inclusiva. */
  to?: ISODate;
  /** Lançamentos em que a conta é origem OU destino. */
  accountId?: string;
  /** Qualquer uma destas categorias. */
  categoryIds?: string[];
  type?: TxType;
  status?: TxStatus;
  recurrenceId?: string;
  installmentGroupId?: string;
  createdBy?: string;
  limit?: number;
}
