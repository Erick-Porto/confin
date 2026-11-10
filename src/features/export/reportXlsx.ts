import type { ReportData } from './report';

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const reais = (cents: number) => cents / 100;

/** Relatório do período em planilha .xlsx (carrega a biblioteca só ao exportar). */
export async function reportToXlsx(data: ReportData): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = (v: string) => ({ value: v, fontWeight: 'bold' as const });
  const money = (cents: number) => ({ value: reais(cents), type: Number, format: MONEY });

  const summary = [
    [head('Grupo'), data.groupName],
    [head('Período'), `${data.periodLabel} (${data.periodStart} a ${data.periodEnd})`],
    [head('Gerado em'), data.generatedAt],
    [],
    [head('Entradas'), money(data.summary.income)],
    [head('Saídas'), money(data.summary.expense)],
    [head('Sobra'), money(data.summary.net)],
    [head('Taxa de poupança'), data.summary.savingsRate === null ? '-' : `${(data.summary.savingsRate * 100).toFixed(1).replace('.', ',')}%`],
  ];

  const catRows = (title: string, list: ReportData['expenseCategories']) => [
    [head(title), head('Total'), head('Participação')],
    ...list.map((c) => [c.name, money(c.total), { value: c.share, type: Number, format: '0.0%' }]),
  ];
  const categories = [...catRows('Saídas por categoria', data.expenseCategories), [], ...catRows('Entradas por categoria', data.incomeCategories)];

  const sheets = [
    { sheet: 'Resumo', data: summary, columns: [{ width: 22 }, { width: 40 }] },
    { sheet: 'Categorias', data: categories, columns: [{ width: 32 }, { width: 16 }, { width: 14 }] },
  ] as Array<{ sheet: string; data: unknown[][]; columns: Array<{ width: number }> }>;

  if (data.plan) {
    sheets.push({
      sheet: 'Plano',
      data: [
        [head('Bloco'), head('% da renda'), head('Planejado'), head('Realizado')],
        ...data.plan.map((b) => [b.name, { value: b.percent / 100, type: Number, format: '0.0%' }, money(b.planned), money(b.done)]),
      ],
      columns: [{ width: 28 }, { width: 12 }, { width: 16 }, { width: 16 }],
    });
  }

  sheets.push({
    sheet: 'Lançamentos',
    data: [
      ['Data', 'Descrição', 'Tipo', 'Situação', 'Categoria', 'Conta', 'Conta destino', 'Valor', 'Tags'].map(head),
      ...data.transactions.map((t) => [t.date, t.description, t.type, t.status, t.category, t.account, t.toAccount, money(t.amount), t.tags]),
    ],
    columns: [{ width: 12 }, { width: 36 }, { width: 14 }, { width: 12 }, { width: 26 }, { width: 24 }, { width: 24 }, { width: 16 }, { width: 20 }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return writeXlsxFile(sheets as any).toBlob();
}
