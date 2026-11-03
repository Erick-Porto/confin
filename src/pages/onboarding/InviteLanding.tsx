import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from '@/components/ui';

export default function InviteLanding() {
  const { code } = useParams<{ code: string }>();
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (code) {
      try {
        localStorage.setItem('confin.pendingInvite', code.toUpperCase());
      } catch {
        // armazenamento indisponível: o convite não sobrevive ao cadastro
      }
    }
    navigate(session ? '/onboarding' : '/cadastro', { replace: true });
  }, [loading, session, code, navigate]);

  return <FullPageSpinner />;
}
