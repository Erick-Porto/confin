import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useGroup } from '@/context/GroupContext';
import { supabaseConfigured } from '@/lib/supabase';
import { FullPageSpinner } from '@/components/ui';
import { AppLayout } from '@/components/layout/AppLayout';

const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const InviteLanding = lazy(() => import('@/pages/onboarding/InviteLanding'));
const Onboarding = lazy(() => import('@/pages/onboarding/Onboarding'));
const Home = lazy(() => import('@/pages/Home'));
const Statement = lazy(() => import('@/pages/Statement'));
const Reports = lazy(() => import('@/pages/Reports'));
const More = lazy(() => import('@/pages/More'));
const Accounts = lazy(() => import('@/pages/Accounts'));
const CardStatement = lazy(() => import('@/pages/CardStatement'));
const Categories = lazy(() => import('@/pages/Categories'));
const Recurrences = lazy(() => import('@/pages/Recurrences'));

/** Só entra logado. Guarda a rota pedida para voltar depois do login. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Só entra quem já tem grupo; senão vai para o onboarding. */
function RequireGroup({ children }: { children: ReactNode }) {
  const { memberships, loading } = useGroup();
  if (loading) return <FullPageSpinner />;
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Telas de login/cadastro: quem já está logado vai para o início. */
function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function MissingConfig() {
  return (
    <div className="mx-auto max-w-md p-6 pt-20 text-center">
      <h1 className="text-lg font-semibold">Configuração pendente</h1>
      <p className="mt-2 text-sm text-muted">
        Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local (veja .env.example e o README).
      </p>
    </div>
  );
}

export default function App() {
  if (!supabaseConfigured) return <MissingConfig />;

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/entrar" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/cadastro" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/esqueci-senha" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/redefinir-senha" element={<RequireAuth><ResetPassword /></RequireAuth>} />
        <Route path="/convite/:code" element={<InviteLanding />} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

        <Route
          element={
            <RequireAuth>
              <RequireGroup>
                <AppLayout />
              </RequireGroup>
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="extrato" element={<Statement />} />
          <Route path="relatorios" element={<Reports />} />
          <Route path="mais" element={<More />} />
          <Route path="contas" element={<Accounts />} />
          <Route path="contas/:id/fatura" element={<CardStatement />} />
          <Route path="categorias" element={<Categories />} />
          <Route path="recorrencias" element={<Recurrences />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
