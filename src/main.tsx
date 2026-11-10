import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { OFFLINE_CACHE_BUSTER, OFFLINE_MAX_AGE, offlinePersister, shouldPersistQuery } from '@/lib/offline';
import { AuthProvider } from '@/context/AuthContext';
import { GroupProvider } from '@/context/GroupContext';
import { UIProvider } from '@/context/UIContext';
import App from '@/App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime longo: o cache salvo no aparelho (modo offline) só guarda o que ainda está em memória.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true, gcTime: OFFLINE_MAX_AGE },
    // Sem internet, gravar falha na hora ("Sem conexão") em vez de ficar esperando.
    mutations: { networkMode: 'always' },
  },
});

// HashRouter: funciona no GitHub Pages sem configurar o servidor (rotas ficam em #/...).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: offlinePersister,
        maxAge: OFFLINE_MAX_AGE,
        buster: OFFLINE_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <HashRouter>
        <AuthProvider>
          <GroupProvider>
            <UIProvider>
              <App />
            </UIProvider>
          </GroupProvider>
        </AuthProvider>
      </HashRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
