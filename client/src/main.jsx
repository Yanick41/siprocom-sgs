import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import './i18n'; // must be imported before any component calls useTranslation
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { registerServiceWorker } from './lib/offline/register';
import { startSync } from './lib/offline/sync';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stock figures must feel live, but not thrash the API on every focus.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry auth/permission/validation failures - only transient ones.
        if ([400, 401, 403, 404, 409, 422].includes(error?.status)) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

// Both are side effects on the window and neither belongs to a component: a
// queue that only drained while some screen was mounted would stop draining
// the moment someone navigated away from it.
registerServiceWorker();
startSync();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outermost, so a failure in any provider still renders something readable. */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/* AuthProvider sits inside the router so it can react to navigation. */}
          <AuthProvider>
            <App />
            <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
