import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@client/src/components/ui/sonner';

import RoutesComponent from './app.tsx';
import './index.css';

const CLIENT_BASE_PATH = import.meta.env.BASE_URL || '/';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-foreground">
    <h2 className="text-lg font-semibold">页面出错了</h2>
    <p className="text-sm text-muted-foreground break-all max-w-md text-center">
      {error.message}
    </p>
    <button
      className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
      onClick={resetErrorBoundary}
    >
      重试
    </button>
  </div>
);

const MainApp = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={CLIENT_BASE_PATH}>
        <div className="min-h-screen bg-background text-foreground">
          <ErrorBoundary
            fallbackRender={({ error, resetErrorBoundary }) => (
              <ErrorFallback
                error={error as Error}
                resetErrorBoundary={resetErrorBoundary}
              />
            )}
          >
            <RoutesComponent />
            {createPortal(<Toaster />, document.body)}
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
