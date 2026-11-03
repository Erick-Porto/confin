import { useUI } from '@/context/UIContext';
import TransactionForm from './TransactionForm';

// Cada abertura da folha gera um estado novo em UIContext; usamos isso como chave
// para remontar o formulário e zerar o estado.
const ids = new WeakMap<object, number>();
let counter = 0;

function keyFor(state: object): number {
  let id = ids.get(state);
  if (id === undefined) {
    id = ++counter;
    ids.set(state, id);
  }
  return id;
}

/**
 * Folha de novo/editar lançamento, renderizada uma vez no AppLayout.
 * O Sheet (título e rodapé) fica dentro de TransactionForm porque os botões do rodapé dependem do estado do formulário.
 */
export default function TransactionSheet() {
  const { txSheet, closeTransactionSheet } = useUI();
  if (!txSheet.open) return null;
  return (
    <TransactionForm
      key={keyFor(txSheet)}
      transaction={txSheet.transaction}
      defaults={txSheet.defaults}
      onClose={closeTransactionSheet}
    />
  );
}
