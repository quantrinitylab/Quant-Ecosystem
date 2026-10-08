'use client';

// ============================================================================
// QuantAI - Page-level error boundary (P0: blank white page fix)
// ============================================================================
// Catches ANY render error in the QuantAI chat page and renders an honest,
// branded sign-in UI instead of a blank white page. This is the last line of
// defense: anonymous users must always see either the chat UI or a proper
// login prompt — never a dead blank surface.
//
// Unlike the generic app error.tsx (which shows "Something went wrong"), this
// boundary is QuantAI-aware: it offers the SSO + sign-in paths that actually
// unblock the user.

import React from 'react';

interface Props {
  children: React.ReactNode;
  onSignIn: () => void;
  onQuantSSO: () => void;
  brandName: string;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class QuantAIPageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log for diagnostics; never surface raw stack to the user.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[QuantAI] page render error caught by boundary:', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { onSignIn, onQuantSSO, brandName } = this.props;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-2xl text-white font-bold shadow-lg shadow-violet-950/40 mb-5">
          Q
        </div>
        <h2 className="text-xl font-bold text-[var(--foreground,#f8fafc)] mb-2">
          {brandName} needs a quick refresh
        </h2>
        <p className="text-sm text-[var(--foreground-secondary,#a1a4ac)] max-w-sm mb-6 leading-relaxed">
          The chat interface hit a snag while loading. Your conversations are safe — sign in to
          continue, or try reloading.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onQuantSSO}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all cursor-pointer"
          >
            <span>⚡</span>
            <span>Continue with Quant SSO</span>
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="px-5 py-2.5 rounded-xl border border-[var(--quant-border,#232938)] bg-[var(--quant-surface,#12151e)] hover:bg-[var(--quant-surface-hover,#1a1f2e)] text-[var(--foreground,#f8fafc)] text-sm font-semibold transition-all cursor-pointer"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-4 py-2.5 rounded-xl text-[var(--foreground-secondary,#a1a4ac)] hover:text-[var(--foreground,#f8fafc)] text-sm font-medium transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
        {this.state.errorMessage && (
          <p className="mt-6 text-[11px] font-mono text-[var(--foreground-secondary,#a1a4ac)] opacity-60 max-w-md truncate">
            {this.state.errorMessage}
          </p>
        )}
      </div>
    );
  }
}
