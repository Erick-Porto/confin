import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Check,
  ChevronRight,
  CalendarClock,
  Copy,
  Crown,
  Download,
  FileUp,
  Flag,
  LineChart,
  LogOut,
  Plus,
  Target,
  TrendingUp,
  Repeat,
  Share2,
  Tag,
  Trash,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGroup } from '@/context/GroupContext';
import { removeGroupAttachmentFiles } from '@/features/attachments/attachments';
import { useUI } from '@/context/UIContext';
import { useAccounts, useCategories, useInvites, useMembers } from '@/hooks/queries';
import { supabase, inviteUrl } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { firstName, todayISO } from '@/lib/format';
import { downloadCsv, fetchAllTransactions, transactionsToCsv } from '@/features/export/csv';
import { ExportOfxSheet } from '@/features/export/ExportOfxSheet';
import { NotificationSettings } from '@/features/notifications/NotificationSettings';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  ListItem,
  PageHeader,
  Segmented,
  SectionTitle,
  Select,
  Sheet,
  Skeleton,
  Switch,
} from '@/components/ui';
import type { Member } from '@/types';

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        tone === 'brand' ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-50' : 'bg-surface-2 text-muted'
      }`}
    >
      {children}
    </span>
  );
}

function Chevron() {
  return <ChevronRight size={18} className="shrink-0 text-muted" />;
}

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export default function More() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { currentGroup, memberships, isOwner, role, setCurrentGroupId, refresh } = useGroup();
  const { theme, setTheme, hideValues, toggleHideValues, toast } = useUI();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const membersQ = useMembers();
  const invitesQ = useInvites(isOwner);
  const members = membersQ.data ?? [];
  const accountsQ = useAccounts();
  const categoriesQ = useCategories();

  // Perfil
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Configurações do grupo
  const [groupName, setGroupName] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // Membros
  const [memberSheet, setMemberSheet] = useState<Member | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);

  // Convites
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  // Zona de perigo
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ofxOpen, setOfxOpen] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [accountText, setAccountText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  if (!currentGroup || !user) {
    return (
      <div>
        <PageHeader title="Mais" />
        <Skeleton className="h-24" />
        <Skeleton className="mt-4 h-40" />
      </div>
    );
  }

  const groupId = currentGroup.id;
  const email = user.email ?? '';
  const nameValue = groupName ?? currentGroup.name;

  async function saveProfile() {
    if (!profileName.trim()) return;
    setSavingProfile(true);
    try {
      await updateProfile(profileName);
      await qc.invalidateQueries({ queryKey: ['members'] });
      toast('Perfil atualizado');
      setProfileOpen(false);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function renameGroup() {
    const name = nameValue.trim();
    if (!name || name === currentGroup?.name) return;
    setSavingGroup(true);
    try {
      const { error } = await supabase.from('groups').update({ name }).eq('id', groupId);
      if (error) throw error;
      await refresh();
      setGroupName(null);
      toast('Grupo renomeado');
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setSavingGroup(false);
    }
  }

  async function changeMonthStart(day: number) {
    try {
      const { error } = await supabase.from('groups').update({ month_start_day: day }).eq('id', groupId);
      if (error) throw error;
      await refresh();
      await qc.invalidateQueries({ queryKey: ['transactions'] });
      toast('Mês financeiro atualizado');
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function changeRole(member: Member, newRole: 'owner' | 'member') {
    setMemberBusy(true);
    try {
      const { error } = await supabase
        .from('group_members')
        .update({ role: newRole })
        .eq('group_id', groupId)
        .eq('user_id', member.user_id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['members'] });
      await refresh();
      toast(newRole === 'owner' ? 'Agora é dono do grupo' : 'Agora é membro do grupo');
      setMemberSheet(null);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setMemberBusy(false);
    }
  }

  async function removeMember(member: Member) {
    setMemberBusy(true);
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', member.user_id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['members'] });
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      await refresh();
      toast('Membro removido');
      setConfirmRemove(null);
      setMemberSheet(null);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setMemberBusy(false);
    }
  }

  async function createInvite() {
    setCreatingInvite(true);
    try {
      const { data, error } = await supabase.rpc('create_invite', { p_group: groupId });
      if (error) throw error;
      setNewCode(data as string);
      await qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setCreatingInvite(false);
    }
  }

  async function revokeInvite(id: string) {
    try {
      const { error } = await supabase.from('group_invites').delete().eq('id', id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['invites'] });
      toast('Convite revogado');
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      toast('Link copiado');
    } catch {
      toast('Não foi possível copiar. Selecione e copie o link manualmente.', { tone: 'error' });
    }
  }

  async function shareLink(code: string) {
    try {
      await navigator.share({ text: `Entre no grupo ${currentGroup?.name ?? ''} no Confin: ${inviteUrl(code)}` });
    } catch {
      // compartilhamento cancelado pelo usuário
    }
  }

  async function leaveGroup() {
    if (!user) return;
    setLeaving(true);
    try {
      const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
      if (error) throw error;
      setConfirmLeave(false);
      await refresh();
      toast('Você saiu do grupo');
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setLeaving(false);
    }
  }

  async function deleteGroup() {
    setDeleting(true);
    try {
      await removeGroupAttachmentFiles(groupId);
      const { error } = await supabase.rpc('delete_group', { p_group: groupId });
      if (error) throw error;
      setConfirmDelete(false);
      await refresh();
      toast('Grupo excluído');
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const txs = await fetchAllTransactions(groupId);
      const csv = transactionsToCsv(txs, {
        accounts: accountsQ.data ?? [],
        categories: categoriesQ.data ?? [],
        members,
      });
      downloadCsv(`confin-${currentGroup?.name ?? 'grupo'}-${todayISO()}.csv`, csv);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      setConfirmAccount(false);
      await signOut();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setDeletingAccount(false);
    }
  }

  const activeInvites = invitesQ.data ?? [];
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="pb-8">
      <PageHeader title="Mais" />

      {/* Perfil */}
      <Card className="py-2">
        <ListItem
          onClick={() => {
            setProfileName(profile?.full_name ?? '');
            setProfileOpen(true);
          }}
          title={profile?.full_name || 'Sem nome'}
          subtitle={email}
          trailing={<Chevron />}
        />
      </Card>

      {/* Grupo ativo */}
      <SectionTitle>Grupo ativo</SectionTitle>
      <Card className="py-2">
        <ListItem
          title={currentGroup.name}
          trailing={<Badge tone="brand">{role === 'owner' ? 'Dono' : 'Membro'}</Badge>}
        />
        {memberships.length > 1 && (
          <div className="border-t border-line pt-1">
            {memberships.map((m) => (
              <ListItem
                key={m.group.id}
                onClick={() => setCurrentGroupId(m.group.id)}
                title={m.group.name}
                subtitle={m.role === 'owner' ? 'Dono' : 'Membro'}
                trailing={m.group.id === groupId ? <Check size={18} className="text-brand-700 dark:text-brand-400" /> : undefined}
              />
            ))}
          </div>
        )}
        <div className="border-t border-line pt-1">
          <ListItem
            onClick={() => navigate('/onboarding?novo=1')}
            leading={<Plus size={20} className="text-muted" />}
            title="Criar ou entrar em outro grupo"
            trailing={<Chevron />}
          />
        </div>
      </Card>

      {/* Configurações do grupo */}
      <SectionTitle>Configurações do grupo</SectionTitle>
      <Card className="space-y-4">
        {isOwner ? (
          <>
            <Field label="Nome do grupo">
              {(id) => (
                <div className="flex gap-2">
                  <Input id={id} value={nameValue} maxLength={60} onChange={(e) => setGroupName(e.target.value)} />
                  <Button
                    onClick={() => void renameGroup()}
                    loading={savingGroup}
                    disabled={!nameValue.trim() || nameValue.trim() === currentGroup.name}
                    className="h-12"
                  >
                    Salvar
                  </Button>
                </div>
              )}
            </Field>
            <Field label="O mês financeiro começa no dia" hint="Útil se o salário cai no dia 5, por exemplo">
              {(id) => (
                <Select
                  id={id}
                  value={currentGroup.month_start_day}
                  onChange={(e) => void changeMonthStart(Number(e.target.value))}
                >
                  {MONTH_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted">Nome do grupo</p>
              <p className="text-sm font-medium">{currentGroup.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted">O mês financeiro começa no dia</p>
              <p className="text-sm font-medium">{currentGroup.month_start_day}</p>
            </div>
            <p className="text-xs text-muted">Só o dono do grupo pode alterar estas configurações.</p>
          </>
        )}
      </Card>

      {/* Membros */}
      <SectionTitle>Membros</SectionTitle>
      <Card className="py-2">
        {membersQ.isLoading ? (
          <Skeleton className="m-2 h-12" />
        ) : membersQ.isError ? (
          <EmptyState title="Não foi possível carregar os membros" />
        ) : (
          members.map((m) => {
            const isSelf = m.user_id === user.id;
            return (
              <ListItem
                key={m.user_id}
                onClick={isOwner && !isSelf ? () => setMemberSheet(m) : undefined}
                leading={
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-50">
                    {firstName(m.profile?.full_name, '?').charAt(0).toUpperCase()}
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{m.profile?.full_name || 'Sem nome'}</span>
                    {isSelf && <Badge>você</Badge>}
                  </span>
                }
                trailing={
                  <>
                    <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{m.role === 'owner' ? 'Dono' : 'Membro'}</Badge>
                    {isOwner && !isSelf && <Chevron />}
                  </>
                }
              />
            );
          })
        )}
      </Card>

      {/* Convites */}
      {isOwner && (
        <>
          <SectionTitle>Convites</SectionTitle>
          <Card>
            <Button
              variant="outline"
              block
              icon={<UserPlus size={18} />}
              loading={creatingInvite}
              onClick={() => void createInvite()}
            >
              Gerar convite
            </Button>
            {invitesQ.isLoading ? (
              <Skeleton className="mt-3 h-12" />
            ) : invitesQ.isError ? (
              <p className="mt-3 text-sm text-expense">Não foi possível carregar os convites.</p>
            ) : activeInvites.length === 0 ? (
              <p className="mt-3 text-center text-sm text-muted">Nenhum convite ativo.</p>
            ) : (
              <div className="mt-2 divide-y divide-line">
                {activeInvites.map((inv) => (
                  <ListItem
                    key={inv.id}
                    title={<span className="font-mono tracking-widest">{inv.code}</span>}
                    subtitle={`expira em ${format(new Date(inv.expires_at), 'dd/MM')}`}
                    trailing={
                      <>
                        <IconButton
                          aria-label={`Ver convite ${inv.code}`}
                          className="h-11 w-11"
                          onClick={() => setNewCode(inv.code)}
                        >
                          <Copy size={18} />
                        </IconButton>
                        <IconButton
                          aria-label={`Revogar convite ${inv.code}`}
                          className="h-11 w-11 text-expense"
                          onClick={() => void revokeInvite(inv.id)}
                        >
                          <Trash size={18} />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Cadastros */}
      <SectionTitle>Cadastros</SectionTitle>
      <Card className="py-2">
        <ListItem
          onClick={() => navigate('/contas')}
          leading={<Wallet size={20} className="text-muted" />}
          title="Contas e cartões"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/categorias')}
          leading={<Tag size={20} className="text-muted" />}
          title="Categorias"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/planejamento')}
          leading={<Target size={20} className="text-muted" />}
          title="Planejamento"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/metas')}
          leading={<Flag size={20} className="text-muted" />}
          title="Metas"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/agenda')}
          leading={<CalendarClock size={20} className="text-muted" />}
          title="Contas a pagar e receber"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/previsao')}
          leading={<LineChart size={20} className="text-muted" />}
          title="Previsão de saldo"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/investimentos')}
          leading={<TrendingUp size={20} className="text-muted" />}
          title="Investimentos"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => navigate('/recorrencias')}
          leading={<Repeat size={20} className="text-muted" />}
          title="Recorrências"
          trailing={<Chevron />}
        />
      </Card>

      {/* Notificações */}
      <SectionTitle>Notificações</SectionTitle>
      <Card>
        <NotificationSettings />
      </Card>

      {/* Exportar */}
      <SectionTitle>Dados</SectionTitle>
      <Card className="py-2">
        <ListItem
          onClick={exporting ? undefined : () => void exportCsv()}
          leading={<Download size={20} className="text-muted" />}
          title={exporting ? 'Exportando...' : 'Exportar todos os lançamentos (CSV)'}
        />
        <ListItem
          onClick={() => navigate('/importar')}
          leading={<FileUp size={20} className="text-muted" />}
          title="Importar extrato"
          trailing={<Chevron />}
        />
        <ListItem
          onClick={() => setOfxOpen(true)}
          leading={<Download size={20} className="text-muted" />}
          title="Exportar extrato OFX"
        />
      </Card>

      {/* Aparência */}
      <SectionTitle>Aparência</SectionTitle>
      <Card className="space-y-3">
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />
        <Switch checked={hideValues} onChange={toggleHideValues} label="Ocultar valores" />
      </Card>

      {/* Zona de perigo */}
      <SectionTitle>Zona de perigo</SectionTitle>
      <Card className="space-y-1 py-2">
        <ListItem
          onClick={() => setConfirmLeave(true)}
          leading={<LogOut size={20} className="text-expense" />}
          title={<span className="text-expense">Sair do grupo</span>}
        />
        {isOwner && (
          <ListItem
            onClick={() => {
              setDeleteText('');
              setConfirmDelete(true);
            }}
            leading={<Trash size={20} className="text-expense" />}
            title={<span className="text-expense">Excluir grupo</span>}
          />
        )}
        <ListItem
          onClick={() => {
            setAccountText('');
            setConfirmAccount(true);
          }}
          leading={<Trash size={20} className="text-expense" />}
          title={<span className="text-expense">Excluir minha conta</span>}
        />
      </Card>

      <Button variant="outline" block className="mt-6" icon={<LogOut size={18} />} onClick={() => void signOut()}>
        Sair da conta
      </Button>
      <p className="mt-4 text-center text-xs text-muted">Confin v0.1</p>

      <ExportOfxSheet open={ofxOpen} onClose={() => setOfxOpen(false)} />

      {/* Editar perfil */}
      <Sheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Seu perfil"
        footer={
          <Button block loading={savingProfile} disabled={!profileName.trim()} onClick={() => void saveProfile()}>
            Salvar
          </Button>
        }
      >
        <Field label="Nome" hint={email}>
          {(id) => <Input id={id} value={profileName} maxLength={80} onChange={(e) => setProfileName(e.target.value)} />}
        </Field>
      </Sheet>

      {/* Ações do membro */}
      <Sheet
        open={!!memberSheet}
        onClose={() => setMemberSheet(null)}
        title={memberSheet?.profile?.full_name || 'Membro'}
      >
        {memberSheet && (
          <div className="space-y-2">
            {memberSheet.role === 'member' ? (
              <Button
                variant="outline"
                block
                icon={<Crown size={18} />}
                loading={memberBusy}
                onClick={() => void changeRole(memberSheet, 'owner')}
              >
                Tornar dono
              </Button>
            ) : (
              <Button variant="outline" block loading={memberBusy} onClick={() => void changeRole(memberSheet, 'member')}>
                Tornar membro
              </Button>
            )}
            <Button variant="outline" block className="text-expense!" onClick={() => setConfirmRemove(memberSheet)}>
              Remover do grupo
            </Button>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={!!confirmRemove}
        title="Remover do grupo?"
        message={`${confirmRemove?.profile?.full_name || 'Este membro'} perde o acesso ao grupo ${currentGroup.name}. Os lançamentos continuam no grupo.`}
        confirmLabel="Remover"
        loading={memberBusy}
        onConfirm={() => confirmRemove && void removeMember(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />

      {/* Convite */}
      <Sheet open={!!newCode} onClose={() => setNewCode(null)} title="Convite">
        {newCode && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted">Envie este código ou link para quem vai entrar no grupo. Vale por 7 dias e só pode ser usado uma vez.</p>
            <p className="rounded-2xl bg-surface-2 py-4 font-mono text-3xl font-bold tracking-[0.3em]">{newCode}</p>
            <p className="break-all rounded-xl border border-line px-3 py-2 text-left text-xs text-muted">{inviteUrl(newCode)}</p>
            <div className="flex gap-3">
              <Button variant="outline" block icon={<Copy size={18} />} onClick={() => void copyLink(newCode)}>
                Copiar link
              </Button>
              {canShare && (
                <Button block icon={<Share2 size={18} />} onClick={() => void shareLink(newCode)}>
                  Compartilhar
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {/* Sair do grupo */}
      <ConfirmDialog
        open={confirmLeave}
        title="Sair do grupo?"
        message={`Você deixa de ver os dados de ${currentGroup.name}. Para voltar, precisará de um novo convite.`}
        confirmLabel="Sair do grupo"
        loading={leaving}
        onConfirm={() => void leaveGroup()}
        onCancel={() => setConfirmLeave(false)}
      />

      {/* Excluir grupo */}
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir grupo?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              block
              loading={deleting}
              disabled={deleteText.trim() !== currentGroup.name}
              onClick={() => void deleteGroup()}
            >
              Excluir
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Todas as contas, categorias e lançamentos do grupo serão apagados para todos os membros. Isso não pode ser desfeito.
          </p>
          <Field label={`Digite "${currentGroup.name}" para confirmar`}>
            {(id) => <Input id={id} value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Sheet>

      {/* Excluir minha conta */}
      <Sheet
        open={confirmAccount}
        onClose={() => setConfirmAccount(false)}
        title="Excluir minha conta?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block onClick={() => setConfirmAccount(false)} disabled={deletingAccount}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              block
              loading={deletingAccount}
              disabled={accountText.trim() !== 'EXCLUIR'}
              onClick={() => void deleteAccount()}
            >
              Excluir conta
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Os grupos em que você está sozinho são excluídos com tudo dentro. Nos grupos compartilhados, você sai, suas contas
            viram "Conjunta" e, se você era o único dono, o membro mais antigo passa a ser dono. Isso não pode ser desfeito.
          </p>
          <p className="text-sm text-muted">Sugestão: exporte os lançamentos em CSV antes de continuar.</p>
          <Field label='Digite "EXCLUIR" para confirmar'>
            {(id) => <Input id={id} value={accountText} onChange={(e) => setAccountText(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
