/**
 * ErrorBoundary — Global React crash protection.
 *
 * Catches any unhandled render/lifecycle error in the component tree,
 * displays a safe recovery screen, and logs structured details to console.
 *
 * Usage in App.tsx:
 *   <ErrorBoundary>
 *     <AppRoutes />
 *   </ErrorBoundary>
 *
 * Features:
 *   - "Try again" resets component tree without full page reload
 *   - "Reload app" hard-reloads as last resort
 *   - Copy error to clipboard for reporting
 *   - Structured console output for dev tools
 *   - Shows app version so crash reports are traceable
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { APP_VERSION } from '../src/version';

interface Props {
  children: ReactNode;
  /** Optional narrow label shown in the error UI (e.g. "Settings", "Dashboard") */
  context?: string;
}

interface State {
  hasError:  boolean;
  error:     Error | null;
  errorInfo: ErrorInfo | null;
  copied:    boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Structured console output — easier to spot in dev tools
    console.group('[ClickPro] 💥 Unhandled React error');
    console.error('Error:',      error.message);
    console.error('Stack:',      error.stack);
    console.error('Component:', errorInfo.componentStack);
    console.error('Version:',    APP_VERSION);
    console.groupEnd();
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  private handleCopy = (): void => {
    const { error, errorInfo } = this.state;
    const text = [
      `ClickPro v${APP_VERSION}`,
      `Error: ${error?.message ?? 'Unknown'}`,
      `Stack: ${error?.stack ?? ''}`,
      `Component: ${errorInfo?.componentStack ?? ''}`,
    ].join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }).catch(() => { /* clipboard unavailable */ });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, copied } = this.state;
    const ctx = this.props.context ? ` (${this.props.context})` : '';

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-red-100 max-w-2xl w-full overflow-hidden">

          {/* Header */}
          <div className="bg-red-50 border-b border-red-100 px-8 py-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5C3.498 18.333 4.46 20 6 20z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-red-800">
                  Ha ocurrido un error inesperado{ctx}
                </h1>
                <p className="text-sm text-red-600 mt-1">
                  {error?.message ?? 'Error desconocido'}
                </p>
              </div>
            </div>
          </div>

          {/* Error detail */}
          <div className="px-8 py-5">
            {errorInfo?.componentStack && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-48 overflow-y-auto mb-6">
                <p className="text-xs font-mono text-gray-500 whitespace-pre-wrap leading-5">
                  {errorInfo.componentStack.trim()}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ClickPro v{APP_VERSION}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 min-w-[120px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Intentar de nuevo
              </button>
              <button
                onClick={this.handleCopy}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
              >
                {copied ? '✓ Copiado' : 'Copiar error'}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
              >
                Recargar app
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
