import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SystemArchitectureDashboard ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center p-gutter bg-background text-on-surface">
          <div className="glass-card rounded-3xl border border-error/20 bg-error-container/10 p-8 max-w-xl text-center">
            <span className="material-symbols-outlined text-5xl text-error mb-4">error_outline</span>
            <h2 className="text-xl font-bold text-on-surface mb-2">Architecture dashboard failed to load</h2>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-4">
              Please refresh the page or try again later. Technical details have been logged to the console.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg bg-secondary-container text-on-secondary-container font-bold text-xs hover:brightness-110 transition-all outline-none"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
