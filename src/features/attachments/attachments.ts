import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useGroup } from '@/context/GroupContext';
import type { TransactionAttachment } from '@/types';

/**
 * Comprovantes (Fase 6): fotos e PDFs ligados a um lançamento.
 *
 * - Arquivo no bucket privado "receipts", caminho <group_id>/<transaction_id>/<uuid>.<ext>; a linha em
 *   transaction_attachments guarda nome, tipo e tamanho. Cada grupo só vê os próprios arquivos.
 * - Fotos são reduzidas no aparelho para JPEG de até 1600 px (cabem milhares no 1 GB do plano gratuito).
 * - Abrir = link assinado de 5 minutos (o bucket não é público).
 * - O banco não apaga arquivos: quem exclui um lançamento ou um grupo chama removeAttachmentFiles
 *   (useDeleteTransaction já faz isso).
 */

export const RECEIPTS_BUCKET = 'receipts';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Valor para o accept do <input type="file">. */
export const ATTACHMENT_ACCEPT = 'image/*,application/pdf';
const MAX_IMAGE_SIDE = 1600;

export const attachmentKeys = {
  list: (transactionId: string) => ['attachments', transactionId] as const,
  counts: (groupId: string, ids: string[]) => ['attachment-counts', groupId, ids.join(',')] as const,
};

export function isImageAttachment(a: Pick<TransactionAttachment, 'mime_type'>): boolean {
  return a.mime_type.startsWith('image/');
}

interface PreparedFile {
  blob: Blob;
  name: string;
  type: TransactionAttachment['mime_type'];
}

/** Foto → JPEG de até 1600 px no maior lado; PDF passa como está. */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const baseName = (file.name.replace(/\.[^.]+$/, '') || 'comprovante').slice(0, 100);
  if (file.type === 'application/pdf') {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('O PDF passa de 10 MB, o limite por arquivo.');
    return { blob: file, name: `${baseName}.pdf`, type: 'application/pdf' };
  }
  if (!file.type.startsWith('image/')) throw new Error('Formato não aceito: envie uma foto ou um PDF.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível ler esta imagem. Tente uma foto em JPG ou PNG.');
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar a imagem neste aparelho.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error('Não foi possível preparar a imagem neste aparelho.');
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('A imagem passa de 10 MB, o limite por arquivo.');
  return { blob, name: `${baseName}.jpg`, type: 'image/jpeg' };
}

/** Comprovantes de um lançamento, do mais antigo para o mais novo. */
export function useAttachments(transactionId: string | null) {
  return useQuery({
    queryKey: attachmentKeys.list(transactionId ?? ''),
    enabled: !!transactionId,
    queryFn: async (): Promise<TransactionAttachment[]> => {
      const { data, error } = await supabase
        .from('transaction_attachments')
        .select('*')
        .eq('transaction_id', transactionId!)
        .order('created_at');
      if (error) throw error;
      return data as TransactionAttachment[];
    },
  });
}

/** Quantos comprovantes tem cada lançamento da lista (para o ícone de clipe). */
export function useAttachmentCounts(transactionIds: string[]) {
  const groupId = useGroup().currentGroup?.id ?? '';
  const ids = [...new Set(transactionIds)].sort();
  return useQuery({
    queryKey: attachmentKeys.counts(groupId, ids),
    enabled: !!groupId && ids.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const counts = new Map<string, number>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase
          .from('transaction_attachments')
          .select('transaction_id')
          .in('transaction_id', ids.slice(i, i + 150));
        if (error) throw error;
        for (const r of data as Array<{ transaction_id: string }>) {
          counts.set(r.transaction_id, (counts.get(r.transaction_id) ?? 0) + 1);
        }
      }
      return counts;
    },
  });
}

function useInvalidateAttachments() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['attachments'] }),
      qc.invalidateQueries({ queryKey: ['attachment-counts'] }),
    ]);
}

/** Prepara (reduz a foto), envia o arquivo e registra o comprovante. Um arquivo por chamada. */
export function useAddAttachment() {
  const invalidate = useInvalidateAttachments();
  return useMutation({
    mutationFn: async ({
      groupId,
      transactionId,
      file,
    }: {
      groupId: string;
      transactionId: string;
      file: File;
    }): Promise<TransactionAttachment> => {
      const prepared = await prepareFile(file);
      const ext = prepared.type === 'application/pdf' ? 'pdf' : 'jpg';
      const path = `${groupId}/${transactionId}/${crypto.randomUUID()}.${ext}`;
      const { error: upError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, prepared.blob, { contentType: prepared.type, upsert: false });
      if (upError) throw upError;
      const { data, error } = await supabase
        .from('transaction_attachments')
        .insert({
          group_id: groupId,
          transaction_id: transactionId,
          storage_path: path,
          file_name: prepared.name,
          mime_type: prepared.type,
          size_bytes: prepared.blob.size,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
        throw error;
      }
      return data as TransactionAttachment;
    },
    onSuccess: () => invalidate(),
  });
}

/** Exclui o comprovante (a linha e o arquivo). */
export function useDeleteAttachment() {
  const invalidate = useInvalidateAttachments();
  return useMutation({
    mutationFn: async (attachment: TransactionAttachment): Promise<void> => {
      const { error } = await supabase.from('transaction_attachments').delete().eq('id', attachment.id);
      if (error) throw error;
      await removeAttachmentFiles([attachment.storage_path]);
    },
    onSuccess: () => invalidate(),
  });
}

/** Link temporário (5 minutos) para ver ou baixar o arquivo. */
export async function attachmentUrl(attachment: Pick<TransactionAttachment, 'storage_path' | 'file_name'>, download = false): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(attachment.storage_path, 300, download ? { download: attachment.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Caminhos dos arquivos dos lançamentos informados (antes de excluí-los). */
export async function attachmentPathsFor(transactionIds: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < transactionIds.length; i += 150) {
    const { data, error } = await supabase
      .from('transaction_attachments')
      .select('storage_path')
      .in('transaction_id', transactionIds.slice(i, i + 150));
    if (error) throw error;
    paths.push(...(data as Array<{ storage_path: string }>).map((r) => r.storage_path));
  }
  return paths;
}

/** Apaga arquivos do armazenamento. Falha aqui não desfaz nada: no pior caso sobra um arquivo sem uso. */
export async function removeAttachmentFiles(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(RECEIPTS_BUCKET).remove(paths.slice(i, i + 100));
  }
}

/** Apaga todos os arquivos de comprovantes do grupo (chame antes de excluir o grupo). */
export async function removeGroupAttachmentFiles(groupId: string): Promise<void> {
  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('transaction_attachments')
      .select('storage_path')
      .eq('group_id', groupId)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    const rows = data as Array<{ storage_path: string }>;
    paths.push(...rows.map((r) => r.storage_path));
    if (rows.length < 1000) break;
  }
  await removeAttachmentFiles(paths);
}
