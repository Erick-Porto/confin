import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useGroup } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { firstName } from '@/lib/format';
import { Button, Card, Field, FullPageSpinner, Input } from '@/components/ui';

const PENDING_KEY = 'confin.pendingInvite';

function readPending(): string {
  try {
    return localStorage.getItem(PENDING_KEY) ?? '';
  } catch {
    return '';
  }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // sem armazenamento: nada a limpar
  }
}

export default function Onboarding() {
  const { profile, signOut } = useAuth();
  const { memberships, loading, refresh, setCurrentGroupId } = useGroup();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const novo = params.get('novo') === '1';

  const [pending] = useState(readPending);
  const [groupName, setGroupName] = useState('');
  const [code, setCode] = useState(pending);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const autoTried = useRef(false);

  async function join(rawCode: string) {
    const value = rawCode.trim().toUpperCase();
    if (!value) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc('accept_invite', { p_code: value });
      if (error) throw error;
      setFinishing(true);
      await refresh();
      setCurrentGroupId(data as string);
      clearPending();
      toast('Você entrou no grupo');
      navigate('/', { replace: true });
    } catch (err) {
      setFinishing(false);
      clearPending();
      setCode('');
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setJoining(false);
    }
  }

  useEffect(() => {
    if (autoTried.current || !pending) return;
    autoTried.current = true;
    void join(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const name = groupName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_group', { p_name: name });
      if (error) throw error;
      setFinishing(true);
      await refresh();
      setCurrentGroupId(data as string);
      toast('Grupo criado com as categorias padrão');
      navigate('/contas', { replace: true });
    } catch (err) {
      setFinishing(false);
      toast(errorMessage(err), { tone: 'error' });
      setCreating(false);
    }
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    if (!joining) void join(code);
  }

  if (loading && !finishing) return <FullPageSpinner />;

  if (memberships.length > 0 && !novo && !pending && !finishing) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-sm bg-bg px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <img
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-2xl"
        />
        <h1 className="mt-3 text-2xl font-bold">Olá, {firstName(profile?.full_name, 'bem-vindo')}!</h1>
        <p className="mt-1 text-sm text-muted">Para começar, crie um grupo ou entre em um que já existe.</p>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Criar um grupo</h2>
          <form onSubmit={onCreate} className="mt-3 space-y-4">
            <Field label="Nome do grupo" hint="Ex.: a família inteira, ou só você em 'Meus gastos'">
              {(id) => (
                <Input
                  id={id}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="FinPorto"
                  maxLength={60}
                />
              )}
            </Field>
            <Button type="submit" block loading={creating} disabled={!groupName.trim()}>
              Criar grupo
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Entrar com convite</h2>
          <form onSubmit={onJoin} className="mt-3 space-y-4">
            <Field label="Código do convite" hint="Peça ao dono do grupo o código de 8 caracteres.">
              {(id) => (
                <Input
                  id={id}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="font-mono uppercase tracking-widest"
                />
              )}
            </Field>
            <Button type="submit" variant="outline" block loading={joining} disabled={code.trim().length < 8}>
              Entrar no grupo
            </Button>
          </form>
        </Card>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        {novo && (
          <Link to="/mais" className="flex min-h-11 items-center text-sm font-medium text-brand-700 dark:text-brand-400">
            Voltar
          </Link>
        )}
        <Button variant="ghost" onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    </div>
  );
}
