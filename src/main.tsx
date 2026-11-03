import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { GroupProvider } from '@/context/GroupContext';
import { UIProvider } from '@/context/UIContext';
import App from '@/App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

// HashRouter: funciona no GitHub Pages sem configurar o servidor (rotas ficam em #/...).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <GroupProvider>
            <UIProvider>
              <App />
            </UIProvider>
          </GroupProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
