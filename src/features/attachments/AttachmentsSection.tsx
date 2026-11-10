import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Paperclip, Trash, X } from 'lucide-react';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { ConfirmDialog, IconButton, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import type { TransactionAttachment } from '@/types';
import {
  ATTACHMENT_ACCEPT,
  attachmentUrl,
  isImageAttachment,
  useAddAttachment,
  useAttachments,
  useDeleteAttachment,
} from './attachments';

const itemClass = 'flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface p-2';

/** Miniatura de um arquivo local (lançamento novo): o objeto é liberado ao sair. */
function PendingItem({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/');
  const preview = useMemo(() => (isImage ? URL.createObjectURL(file) : null), [file, isImage]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <li className={itemClass}>
      {preview ? (
        <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <FileText size={22} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
      <IconButton aria-label={`Remover ${file.name}`} onClick={onRemove}>
        <X size={18} />
      </IconButton>
    </li>
  );
}

/** Abre o link assinado em outra aba (a janela é aberta antes, para o iOS não bloquear). */
async function openAttachment(a: TransactionAttachment) {
  const win = window.open('', '_blank');
  try {
    const url = await attachmentUrl(a);
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (err) {
    win?.close();
    throw err;
  }
}

export function AttachmentsSection({
  transactionId,
  pendingFiles,
  onPendingFilesChange,
}: {
  transactionId?: string;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
}) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const list = useAttachments(transactionId ?? null);
  const add = useAddAttachment();
  const del = useDeleteAttachment();
  const [uploading, setUploading] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<TransactionAttachment | null>(null);

  const attachments = list.data ?? [];
  const images = attachments.filter(isImageAttachment);
  const imageKey = images.map((a) => a.id).join(',');
  // Links das miniaturas: buscados uma vez por lista de fotos.
  const thumbs = useQuery({
    queryKey: ['attachment-thumbs', imageKey],
    enabled: images.length > 0,
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      const entries = await Promise.all(images.map(async (a) => [a.id, await attachmentUrl(a)] as const));
      return new Map(entries);
    },
  });

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (picked.length === 0) return;
    if (!transactionId) {
      onPendingFilesChange([...pendingFiles, ...picked]);
      return;
    }
    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setUploading((u) => [...u, key]);
      try {
        await add.mutateAsync({ groupId, transactionId, file });
      } catch (err) {
        toast(`${file.name}: ${errorMessage(err)}`, { tone: 'error' });
      } finally {
        setUploading((u) => u.filter((k) => k !== key));
      }
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete);
      setToDelete(null);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  const empty = transactionId
    ? !list.isLoading && attachments.length === 0 && uploading.length === 0
    : pendingFiles.length === 0;

  return (
    <section aria-label="Comprovantes" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Comprovantes</h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300"
        >
          <Paperclip size={16} /> Adicionar comprovante
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void onPick(e.target.files)}
        />
      </div>

      {transactionId && list.isLoading && <div className="h-14 animate-pulse rounded-xl bg-surface-2" />}
      {transactionId && list.isError && (
        <p className="text-sm text-expense">Não foi possível carregar os comprovantes.</p>
      )}

      {(attachments.length > 0 || uploading.length > 0 || pendingFiles.length > 0) && (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => {
            const thumb = thumbs.data?.get(a.id);
            return (
              <li key={a.id} className={itemClass}>
                <button
                  type="button"
                  onClick={() => openAttachment(a).catch((err) => toast(errorMessage(err), { tone: 'error' }))}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {isImageAttachment(a) && thumb ? (
                    <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                      {isImageAttachment(a) && thumbs.isLoading ? <Spinner size={16} /> : <FileText size={22} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{a.file_name}</span>
                </button>
                <IconButton aria-label={`Excluir ${a.file_name}`} onClick={() => setToDelete(a)}>
                  <Trash size={18} />
                </IconButton>
              </li>
            );
          })}
          {uploading.map((k) => (
            <li key={k} className={`${itemClass} text-sm text-muted`}>
              <Spinner size={18} /> Enviando…
            </li>
          ))}
          {pendingFiles.map((f, i) => (
            <PendingItem
              key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
              file={f}
              onRemove={() => onPendingFilesChange(pendingFiles.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}

      {empty && !(transactionId && list.isError) && <p className="text-sm text-muted">Nenhum comprovante</p>}
      {!transactionId && <p className="text-xs text-muted">Os comprovantes são enviados ao salvar.</p>}

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir comprovante?"
        message={toDelete?.file_name}
        confirmLabel="Excluir"
        loading={del.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
