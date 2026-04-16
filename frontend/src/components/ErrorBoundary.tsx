import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback UI to render when an error is caught */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Enterprise-grade React Error Boundary.
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and renders a recovery-friendly fallback UI instead
 * of crashing the entire application.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to structured console — in production this would go to Sentry / Datadog / etc.
    console.error('[ErrorBoundary] Uncaught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '2rem',
            fontFamily: "'72', Arial, sans-serif",
            color: '#32363a',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '0.75rem',
              boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
              padding: '2.5rem',
              maxWidth: '480px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p style={{ margin: '0 0 1.5rem', color: '#6a6d70', fontSize: '0.875rem', lineHeight: 1.5 }}>
              An unexpected error occurred. Your work has been preserved.
              {this.state.error && (
                <span style={{ display: 'block', marginTop: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#bb0000' }}>
                  {this.state.error.message}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '0.625rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #0a6ed1',
                  background: '#0a6ed1',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '0.625rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d9d9d9',
                  background: '#fff',
                  color: '#32363a',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
