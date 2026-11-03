import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

export function hasPendingInvite(): boolean {
  try {
    return !!localStorage.getItem('confin.pendingInvite');
  } catch {
    return false;
  }
}

/** Moldura comum das telas de acesso: logo, título e card do formulário. */
export function AuthShell({
  subtitle,
  showInviteBanner,
  children,
}: {
  subtitle: string;
  showInviteBanner?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-2xl"
          />
          <h1 className="mt-3 text-2xl font-bold text-fg">Confin</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {showInviteBanner && hasPendingInvite() && (
          <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:bg-brand-900/40 dark:text-brand-50">
            Você recebeu um convite para um grupo. Entre ou crie sua conta para aceitar.
          </div>
        )}
        <Card className="p-5">{children}</Card>
      </div>
    </div>
  );
}
