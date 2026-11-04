import { lazy, StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useLocation } from 'react-router-dom';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import { AppRoutes } from './app/AppRoutes';
import { ErrorBoundary } from './app/ErrorBoundary';
import { Shell } from './app/shell/Shell';
import { AuthProvider, useAuth } from './auth';
import { Button } from './components/Button';
import { SkeletonPage } from './components/Skeleton';
import { ToastProvider } from './components/Toast';
import { queryClient } from './lib/query';
import { watchSystemTheme } from './lib/theme';
import { CardPage } from './pages/auth/CardPage';
import { ChangePasswordForm } from './pages/auth/ChangePasswordForm';
import { Login } from './pages/auth/Login';
import { Setup } from './pages/auth/Setup';
import { captureInstallPrompt } from './pwa/install';
import { registerServiceWorker } from './pwa/register';

// The QR library is only needed during enrolment, so MFA is not in the initial bundle.
const MfaVerify = lazy(() => import('./pages/auth/Mfa').then((m) => ({ default: m.MfaVerify })));
const MfaEnroll = lazy(() => import('./pages/auth/Mfa').then((m) => ({ default: m.MfaEnroll })));

function Boot() {
  return <main className="boot"><SkeletonPage /></main>;
}

function App() {
  const { config, configError, me, loading, refresh } = useAuth();
  const { pathname } = useLocation();
  if (configError) {
    return (
      <CardPage cfg={null}>
        {configError.kind === 'temporary'
          ? (
            <>
              <h1>{navigator.onLine ? 'Please wait a moment' : 'You are offline'}</h1>
              <p className="text-2">{navigator.onLine ? 'The service is temporarily unavailable. Retrying automatically.' : 'This app needs a connection to load. It will continue when you are back online.'}</p>
              <div><Button onClick={() => window.location.reload()}>Retry now</Button></div>
            </>
          )
          : <><h1>This address is not configured</h1><p className="text-2">{configError.message}</p></>}
      </CardPage>
    );
  }
  if (!config || loading) return <Boot />;
  if (pathname === '/setup') return <Setup cfg={config} />;
  if (!me) return <Login cfg={config} />;
  if (me.mfa.pending) return <CardPage cfg={config}><Suspense fallback={<SkeletonPage />}><MfaVerify onDone={refresh} /></Suspense></CardPage>;
  if (me.mfa.enrollmentRequired) {
    return (
      <CardPage cfg={config}>
        <h1>Set up two-factor authentication</h1>
        <Suspense fallback={<SkeletonPage />}><MfaEnroll intro="Your organization requires a second step at sign-in to protect employee, payroll and configuration data." onDone={refresh} /></Suspense>
      </CardPage>
    );
  }
  if (me.passwordChangeRequired) return <CardPage cfg={config}><h1>Choose a new password</h1><ChangePasswordForm forced onDone={refresh} /></CardPage>;
  return <Shell><AppRoutes /></Shell>;
}

watchSystemTheme();
captureInstallPrompt();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fullPage>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
