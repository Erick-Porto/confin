import type { ReportData } from './report';

const reais = (cents: number) => {
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 ? '-' : ''}R$ ${int},${String(abs % 100).padStart(2, '0')}`;
};
const pct = (r: number) => `${(r * 100).toFixed(1).replace('.', ',')}%`;

/** Relatório do período em PDF A4 retrato (carrega as bibliotecas só ao exportar). */
export async function reportToPdf(data: ReportData): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const green = [15, 118, 110] as [number, number, number];
  let y = 18;

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(`Confin · ${data.groupName} · ${data.periodLabel}`, 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período ${data.periodStart} a ${data.periodEnd} · gerado em ${data.generatedAt}`, 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`Entradas: ${reais(data.summary.income)}`, 14, y);
  doc.text(`Saídas: ${reais(data.summary.expense)}`, 14, y + 6);
  doc.text(`Sobra: ${reais(data.summary.net)}${data.summary.savingsRate === null ? '' : ` (${pct(data.summary.savingsRate)} das entradas)`}`, 14, y + 12);
  y += 18;

  const table = (title: string, head: string[], body: string[][], right: number[]) => {
    if (body.length === 0) return;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, y + 4);
    autoTable(doc, {
      startY: y + 7,
      head: [head],
      body,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: green },
      columnStyles: Object.fromEntries(right.map((i) => [i, { halign: 'right' as const }])),
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };

  table('Saídas por categoria', ['Categoria', 'Total', '%'], data.expenseCategories.map((c) => [c.name, reais(c.total), pct(c.share)]), [1, 2]);
  table('Entradas por categoria', ['Categoria', 'Total', '%'], data.incomeCategories.map((c) => [c.name, reais(c.total), pct(c.share)]), [1, 2]);
  if (data.plan) {
    table('Plano', ['Bloco', '% da renda', 'Planejado', 'Realizado'], data.plan.map((b) => [b.name, `${b.percent}%`, reais(b.planned), reais(b.done)]), [1, 2, 3]);
  }
  table(
    'Lançamentos',
    ['Data', 'Descrição', 'Categoria', 'Conta', 'Valor'],
    data.transactions.map((t) => [t.date, t.description, t.category, t.toAccount ? `${t.account} → ${t.toAccount}` : t.account, reais(t.amount)]),
    [4],
  );

  return doc.output('blob');
}
