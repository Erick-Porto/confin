import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { Button, Card, SectionTitle } from '@/components/ui';
import { getPushState, type PushState } from '@/lib/push';

const TEXTS: Partial<Record<PushState, { description: string; action: string }>> = {
  off: {
    description: 'Receba um aviso quando uma conta estiver para vencer ou o plano do mês chegar perto do limite.',
    action: 'Ativar notificações',
  },
  'needs-install': {
    description: 'No iPhone, os avisos só chegam com o app instalado na tela de início.',
    action: 'Ver como ativar',
  },
  denied: {
    description: 'As notificações estão bloqueadas neste navegador. Veja como liberar.',
    action: 'Ver como liberar',
  },
};

/** Seção "Avisos" do Início: convida a ativar as notificações quando elas não estão ativas neste aparelho. */
export function NotificationsInvite() {
  const navigate = useNavigate();
  const [state, setState] = useState<PushState | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      getPushState()
        .then((s) => alive && setState(s))
        .catch(() => alive && setState(null));
    };
    check();
    // Atualiza ao voltar para o app (ex.: depois de liberar nas configurações do navegador).
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const text = state ? TEXTS[state] : undefined;
  if (!text) return null;

  return (
    <section aria-label="Avisos">
      <SectionTitle>Avisos</SectionTitle>
      <Card className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
          <BellRing size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-fg">Ative as notificações</p>
          <p className="mt-0.5 text-sm text-muted">{text.description}</p>
          <Button className="mt-3" onClick={() => navigate('/notificacoes')}>
            {text.action}
          </Button>
        </div>
      </Card>
    </section>
  );
}
