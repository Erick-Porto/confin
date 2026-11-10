import type { ISODate } from '@/types';

/**
 * Leitura de extratos (Fase 8): OFX (1.x SGML e 2.x XML) e CSV de qualquer banco.
 *
 * - Valores com sinal: positivo = entrou dinheiro na conta, negativo = saiu (como no OFX de conta corrente).
 *   Em fatura de cartão o banco às vezes usa o sinal ao contrário: a revisão tem "Inverter sinais".
 * - importId identifica a linha: "ofx:<FITID>" ou "csv:<resumo de data|valor|descrição|repetição>". Importar o
 *   mesmo arquivo de novo não duplica (o banco recusa o mesmo import_id na mesma conta).
 * - CSV: separador, colunas e formatos (dd/mm/aaaa, aaaa-mm-dd, 1.234,56, -1234.56, "R$ 10,00 D") são
 *   detectados; quando não dá para saber as colunas, a tela pede o mapeamento (CsvMapping).
 */

export interface ImportRow {
  date: ISODate;
  /** Centavos com sinal: + entrada, − saída. */
  amount_cents: number;
  description: string;
  importId: string;
}

export interface CsvMapping {
  date: number;
  description: number;
  /** Coluna única de valor com sinal… */
  amount: number | null;
  /** …ou colunas separadas de débito e crédito. */
  debit: number | null;
  credit: number | null;
  /** Coluna com o identificador da linha no banco (ex.: "Identificador" do Nubank), se houver. */
  id: number | null;
}

export interface CsvTable {
  headers: string[];
  records: string[][];
  /** Mapeamento detectado, ou null quando a tela precisa pedir. */
  mapping: CsvMapping | null;
}

export interface ParsedFile {
  format: 'ofx' | 'csv';
  rows: ImportRow[];
  /** Número da conta no arquivo (OFX), para conferência. */
  accountHint: string | null;
  /** O arquivo é de cartão de crédito (OFX com CCSTMTRS ou CSV no formato de fatura). */
  creditCard: boolean;
  /** Sugestão para "Inverter sinais" (ex.: CSV de fatura em que compras vêm positivas). */
  suggestInvert: boolean;
  csv: CsvTable | null;
  /** Linhas ignoradas por data ou valor ilegível. */
  skipped: number;
}

// ---------------------------------------------------------------------------
// Texto e números
// ---------------------------------------------------------------------------

/** Lê o arquivo respeitando o charset (OFX costuma vir em windows-1252). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 600));
  const declared = /CHARSET:\s*(\d+)/i.exec(head)?.[1] ?? /encoding="([^"]+)"/i.exec(head)?.[1];
  if (declared && /1252|latin|8859/i.test(declared)) return new TextDecoder('windows-1252').decode(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Resumo curto e estável de um texto (FNV-1a de 32 bits, em hexadecimal). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data em dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd ou aaaammdd → ISO, ou null. */
export function parseDate(raw: string): ISODate | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else if ((match = /^(\d{4})(\d{2})(\d{2})/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "1.234,56", "-1234.56", "(10,00)", "R$ 10,00 D", "10,00-" → centavos com sinal, ou null. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/[dD]$/.test(s)) {
    negative = true;
    s = s.slice(0, -1);
  } else if (/[cC]$/.test(s)) {
    s = s.slice(0, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/^R\$/i, '').replace(/^\+/, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/^R\$/i, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

function cleanText(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function ofxField(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? cleanText(m[1]) : '';
}

function parseOfx(text: string): ParsedFile {
  const rows: ImportRow[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
  for (const block of blocks) {
    const date = parseDate(ofxField(block, 'DTPOSTED'));
    // No OFX o valor vem como "-1234.56" (alguns bancos usam vírgula decimal).
    const rawAmount = ofxField(block, 'TRNAMT').replace(/s/g, '');
    const numeric = Number(rawAmount.includes(',') && !rawAmount.includes('.') ? rawAmount.replace(',', '.') : rawAmount.replace(/,/g, ''));
    const amount = Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
    if (!date || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    const name = ofxField(block, 'NAME');
    const memo = ofxField(block, 'MEMO');
    const description = (name && memo && !memo.includes(name) ? `${name} ${memo}` : memo || name || ofxField(block, 'TRNTYPE')).slice(0, 120);
    const fitid = ofxField(block, 'FITID');
    let importId: string;
    if (fitid) {
      importId = `ofx:${fitid}`.slice(0, 200);
    } else {
      const base = `${date}|${amount}|${description.toLowerCase()}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      importId = `ofx:${hash(`${base}|${n}`)}`;
    }
    rows.push({ date, amount_cents: amount, description, importId });
  }
  const creditCard = /<CCSTMTRS>/i.test(text);
  return {
    format: 'ofx',
    rows,
    accountHint: ofxField(text, 'ACCTID') || null,
    creditCard,
    suggestInvert: false,
    csv: null,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function detectDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t', '|'].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** CSV com aspas (RFC 4180). */
function parseCsvText(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) records.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) records.push(row);
  return records.map((r) => r.map((f) => f.trim()));
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DATE_HEADERS = ['data', 'date', 'dt', 'data lancamento', 'data do lancamento', 'data da compra', 'data movimento', 'data transacao'];
const DESC_HEADERS = ['descricao', 'description', 'title', 'titulo', 'historico', 'lancamento', 'estabelecimento', 'detalhes', 'memo', 'nome'];
const AMOUNT_HEADERS = ['valor', 'amount', 'value', 'quantia', 'valor r', 'valor rs', 'valor brl', 'montante'];
const DEBIT_HEADERS = ['debito', 'saida', 'saidas', 'debitos'];
const CREDIT_HEADERS = ['credito', 'entrada', 'entradas', 'creditos'];
const ID_HEADERS = ['identificador', 'id', 'id transacao', 'codigo da transacao'];

function findHeader(headers: string[], names: string[]): number | null {
  const normalized = headers.map(norm);
  for (const name of names) {
    const i = normalized.indexOf(name);
    if (i >= 0) return i;
  }
  for (const name of names) {
    const i = normalized.findIndex((h) => h.startsWith(name));
    if (i >= 0) return i;
  }
  return null;
}

function detectMapping(headers: string[]): CsvMapping | null {
  const date = findHeader(headers, DATE_HEADERS);
  const description = findHeader(headers, DESC_HEADERS);
  const amount = findHeader(headers, AMOUNT_HEADERS);
  const debit = findHeader(headers, DEBIT_HEADERS);
  const credit = findHeader(headers, CREDIT_HEADERS);
  const normalized = headers.map(norm);
  const idIndex = ID_HEADERS.map((n) => normalized.indexOf(n)).find((i) => i >= 0);
  const id = idIndex === undefined ? null : idIndex;
  if (date === null || description === null) return null;
  if (amount !== null) return { date, description, amount, debit: null, credit: null, id };
  if (debit !== null && credit !== null) return { date, description, amount: null, debit, credit, id };
  return null;
}

/** Aplica o mapeamento às linhas do CSV (a tela chama de novo quando a pessoa troca as colunas). */
export function applyCsvMapping(table: CsvTable, mapping: CsvMapping): { rows: ImportRow[]; skipped: number } {
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const rec of table.records) {
    const date = parseDate(rec[mapping.date] ?? '');
    let amount: number | null = null;
    if (mapping.amount !== null) {
      amount = parseAmount(rec[mapping.amount] ?? '');
    } else if (mapping.debit !== null && mapping.credit !== null) {
      const debit = parseAmount(rec[mapping.debit] ?? '');
      const credit = parseAmount(rec[mapping.credit] ?? '');
      if (credit) amount = Math.abs(credit);
      else if (debit) amount = -Math.abs(debit);
    }
    const description = cleanText(rec[mapping.description] ?? '').slice(0, 120);
    if (!date || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    const base = `${date}|${amount}|${description.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const bankId = mapping.id !== null ? (rec[mapping.id] ?? '').trim() : '';
    const importId = bankId ? `csv:${bankId}`.slice(0, 200) : `csv:${hash(`${base}|${n}`)}`;
    rows.push({ date, amount_cents: amount, description: description || 'Sem descrição', importId });
  }
  return { rows, skipped };
}

function parseCsv(text: string): ParsedFile {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const all = parseCsvText(text.replace(/^\uFEFF/, ''), detectDelimiter(firstLine));
  // Alguns bancos põem linhas de título antes do cabeçalho: usa a primeira linha que tenha data e descrição.
  let headerIndex = all.findIndex((r) => detectMapping(r) !== null);
  if (headerIndex < 0) headerIndex = 0;
  const headers = all[headerIndex] ?? [];
  const records = all.slice(headerIndex + 1);
  const mapping = detectMapping(headers);
  const table: CsvTable = { headers, records, mapping };
  const { rows, skipped } = mapping ? applyCsvMapping(table, mapping) : { rows: [], skipped: 0 };
  // Fatura em CSV (ex.: Nubank "date,title,amount"): compras vêm positivas.
  const normalized = headers.map(norm);
  const cardLike = normalized.includes('title') && normalized.includes('amount');
  return { format: 'csv', rows, accountHint: null, creditCard: cardLike, suggestInvert: cardLike, csv: table, skipped };
}

/** Lê um arquivo .ofx ou .csv (o formato é detectado pelo conteúdo). */
export async function readImportFile(file: File): Promise<ParsedFile> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo de 5 MB).');
  const text = await readText(file);
  if (/<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) return parseOfx(text);
  if (/<\?xml/i.test(text.slice(0, 200)) && /<OFX/i.test(text)) return parseOfx(text);
  return parseCsv(text);
}
