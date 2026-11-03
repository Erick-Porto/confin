import type { Account, AccountType, Member } from '@/types';
import { firstName } from './format';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  credit_card: 'Cartão de crédito',
  investment: 'Investimento',
};

export const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = (
  Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]
).map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }));

/** Nome do titular para exibir: primeiro nome do membro ou "Conjunta". */
export function ownerLabel(ownerId: string | null, members: Member[]): string {
  if (!ownerId) return 'Conjunta';
  const member = members.find((m) => m.user_id === ownerId);
  return firstName(member?.profile?.full_name, 'Ex-membro');
}

/** Rótulo completo da conta: "Erick - Nubank". */
export function accountLabel(account: Pick<Account, 'owner_id' | 'name'>, members: Member[]): string {
  return `${ownerLabel(account.owner_id, members)} - ${account.name}`;
}

/** Ordenação padrão: ativas primeiro, depois sort_order e nome. */
export function sortAccounts<T extends Pick<Account, 'archived' | 'sort_order' | 'name'>>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/** Cartão de crédito tem saldo negativo quando há fatura em aberto. */
export function isCreditCard(account: Pick<Account, 'type'>): boolean {
  return account.type === 'credit_card';
}
