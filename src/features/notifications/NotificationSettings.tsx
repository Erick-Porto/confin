import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { Button, Switch } from '@/components/ui';
import { disablePush, enablePush, getPushState, showTestNotification, type PushState } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

type Pref = 'notify_bills' | 'notify_budget';

export function NotificationSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useUI();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<Pref, boolean>>({
    notify_bills: profile?.notify_bills ?? true,
    notify_budget: profile?.notify_budget ?? true,
  });

  useEffect(() => {
    let alive = true;
    getPushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (profile) setPrefs({ notify_bills: profile.notify_bills, notify_budget: profile.notify_budget });
  }, [profile]);

  async function toggle() {
    setBusy(true);
    try {
      if (state === 'on') await disablePush();
      else await enablePush();
      setState(await getPushState());
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setState(await getPushState().catch(() => 'unsupported' as PushState));
    } finally {
      setBusy(false);
    }
  }

  async function setPref(key: Pref, value: boolean) {
    if (!user) return;
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    const { error } = await supabase.from('profiles').update({ [key]: value }).eq('id', user.id);
    if (error) {
      setPrefs((p) => ({ ...p, [key]: previous }));
      toast(errorMessage(error), { tone: 'error' });
      return;
    }
    void refreshProfile();
  }

  async function sendTest() {
    try {
      await showTestNotification();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  return (
    <div className="space-y-3">
      {state === null ? (
        <p className="text-sm text-muted">Verificando este aparelho...</p>
      ) : state === 'unsupported' ? (
        <p className="text-sm text-muted">Este navegador não oferece notificações.</p>
      ) : state === 'needs-install' ? (
        <p className="text-sm text-muted">
          No iPhone, instale o app: Compartilhar › Adicionar à Tela de Início, abra por lá e ative.
        </p>
      ) : state === 'denied' ? (
        <p className="text-sm text-muted">
          As notificações estão bloqueadas. Permita-as nas configurações do navegador para este site e volte aqui.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant={state === 'on' ? 'outline' : 'primary'}
            block
            icon={<Bell size={18} />}
            loading={busy}
            onClick={() => void toggle()}
          >
            {state === 'on' ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}
          </Button>
          {state === 'on' && (
            <Button variant="ghost" block onClick={() => void sendTest()}>
              Enviar teste
            </Button>
          )}
        </div>
      )}
      <Switch
        checked={prefs.notify_bills}
        onChange={(v) => void setPref('notify_bills', v)}
        label="Contas a pagar e receber e faturas"
      />
      <Switch
        checked={prefs.notify_budget}
        onChange={(v) => void setPref('notify_budget', v)}
        label="Plano e orçamento perto do limite"
      />
      <p className="text-xs text-muted">Os avisos chegam uma vez por dia, por volta das 8h.</p>
    </div>
  );
}
