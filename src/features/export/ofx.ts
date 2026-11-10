import type { Account, ISODate, Transaction } from '@/types';
import { isEffective, signedAmountForAccount } from '@/lib/rules';
import { todayISO } from '@/lib/format';

/**
 * Exporta os lançamentos efetivados de uma conta em OFX 1.02 (SGML, UTF-8), o formato que bancos e programas
 * de finanças aceitam. Cartão de crédito sai como extrato de cartão (CCSTMTRS). FITID = id do lançamento.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ');
const ofxDate = (iso: ISODate) => iso.replace(/-/g, '');
const ofxAmount = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * @param txs lançamentos que envolvem a conta no período (os não efetivados são ignorados)
 * @param balanceCents saldo da conta no fim do período (vai em LEDGERBAL)
 */
export function transactionsToOfx(
  account: Account,
  txs: Transaction[],
  range: { from: ISODate; to: ISODate },
  balanceCents: number,
): string {
  const today = todayISO();
  const card = account.type === 'credit_card';
  const lines = txs
    .filter((t) => isEffective(t, today) && t.date >= range.from && t.date <= range.to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => {
      const amount = signedAmountForAccount(t, account.id);
      const name = esc(t.description || 'Lançamento').slice(0, 32);
      return [
        '<STMTTRN>',
        `<TRNTYPE>${amount < 0 ? 'DEBIT' : 'CREDIT'}`,
        `<DTPOSTED>${ofxDate(t.date)}`,
        `<TRNAMT>${ofxAmount(amount)}`,
        `<FITID>${t.id}`,
        `<NAME>${name}`,
        `<MEMO>${esc(t.description || '')}`,
        '</STMTTRN>',
      ].join('\n');
    });

  const acctId = esc(account.name).slice(0, 22) || account.id.slice(0, 22);
  const list = [`<BANKTRANLIST>`, `<DTSTART>${ofxDate(range.from)}`, `<DTEND>${ofxDate(range.to)}`, ...lines, `</BANKTRANLIST>`];
  const ledger = [`<LEDGERBAL>`, `<BALAMT>${ofxAmount(balanceCents)}`, `<DTASOF>${ofxDate(range.to)}`, `</LEDGERBAL>`];
  const status = '<STATUS>\n<CODE>0\n<SEVERITY>INFO\n</STATUS>';

  const body = card
    ? [
        '<CREDITCARDMSGSRSV1>',
        '<CCSTMTTRNRS>',
        '<TRNUID>1',
        status,
        '<CCSTMTRS>',
        '<CURDEF>BRL',
        `<CCACCTFROM>\n<ACCTID>${acctId}\n</CCACCTFROM>`,
        ...list,
        ...ledger,
        '</CCSTMTRS>',
        '</CCSTMTTRNRS>',
        '</CREDITCARDMSGSRSV1>',
      ]
    : [
        '<BANKMSGSRSV1>',
        '<STMTTRNRS>',
        '<TRNUID>1',
        status,
        '<STMTRS>',
        '<CURDEF>BRL',
        `<BANKACCTFROM>\n<BANKID>0000\n<ACCTID>${acctId}\n<ACCTTYPE>${account.type === 'savings' ? 'SAVINGS' : 'CHECKING'}\n</BANKACCTFROM>`,
        ...list,
        ...ledger,
        '</STMTRS>',
        '</STMTTRNRS>',
        '</BANKMSGSRSV1>',
      ];

  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:UNICODE',
    'CHARSET:NONE',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
    '<OFX>',
    '<SIGNONMSGSRSV1>',
    '<SONRS>',
    status,
    `<DTSERVER>${stamp()}`,
    '<LANGUAGE>POR',
    '</SONRS>',
    '</SIGNONMSGSRSV1>',
    ...body,
    '</OFX>',
    '',
  ].join('\n');
}
