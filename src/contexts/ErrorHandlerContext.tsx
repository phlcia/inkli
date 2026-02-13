import React, { createContext, useCallback, useContext, useState } from 'react';
import { Alert } from 'react-native';
import {
  classifyError,
  getErrorMessage,
} from '../utils/errorHandling';
import { ErrorToast } from '../components/ErrorToast';

const RETRY_THROTTLE_MS = 2000;

interface ToastState {
  message: string;
  onRetry?: () => void;
}

interface ErrorHandlerContextType {
  showServerError: (message: string, onRetry?: () => void) => void;
  showClientError: (message: string) => void;
  handleApiError: (error: unknown, context: string, onRetry?: () => void) => void;
}

const ErrorHandlerContext = createContext<ErrorHandlerContextType | undefined>(
  undefined
);

export function ErrorHandlerProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const lastRetryAtRef = React.useRef<number>(0);

  const dismissToast = useCallback(() => setToast(null), []);

  const showServerError = useCallback(
    (message: string, onRetry?: () => void) => {
      setToast({ message, onRetry });
    },
    []
  );

  const showClientError = useCallback((message: string) => {
    Alert.alert('Error', message);
  }, []);

  const handleApiError = useCallback(
    (error: unknown, context: string, onRetry?: () => void) => {
      const tier = classifyError(error);
      const message = getErrorMessage(error, tier, context);

      switch (tier) {
        case 'offline':
          // Offline banner is shown automatically via useNetworkStatus
          // No toast - user sees persistent banner
          break;

        case 'server': {
          const wrappedRetry = onRetry
            ? () => {
                const now = Date.now();
                if (now - lastRetryAtRef.current < RETRY_THROTTLE_MS) {
                  return;
                }
                lastRetryAtRef.current = now;
                onRetry();
              }
            : undefined;
          showServerError(message, wrappedRetry);
          break;
        }

        case 'client':
          showClientError(message);
          break;
      }
    },
    [showServerError, showClientError]
  );

  const value: ErrorHandlerContextType = {
    showServerError,
    showClientError,
    handleApiError,
  };

  return (
    <ErrorHandlerContext.Provider value={value}>
      {children}
      {toast && (
        <ErrorToast
          message={toast.message}
          onRetry={toast.onRetry}
          onDismiss={dismissToast}
        />
      )}
    </ErrorHandlerContext.Provider>
  );
}

export function useErrorHandler(): ErrorHandlerContextType {
  const ctx = useContext(ErrorHandlerContext);
  if (ctx === undefined) {
    throw new Error('useErrorHandler must be used within ErrorHandlerProvider');
  }
  return ctx;
}
