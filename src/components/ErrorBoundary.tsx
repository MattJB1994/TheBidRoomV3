/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Error boundary. React error boundaries must be class components — this
 * is the one place in the codebase that isn't a function component, and
 * that's a React constraint, not a style choice.
 *
 * Without this, an uncaught error anywhere in the tree unmounts the
 * whole app to a blank white screen with no way back except a hard
 * refresh (which, for an unsaved draft, means losing it). This catches
 * the error, shows a recoverable fallback, and lets the person retry the
 * failed section without losing everything else — a full-page crash and
 * a "something went wrong in Pricing" card are very different outcomes
 * for someone mid-bid.
 */
import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Label shown in the fallback, e.g. "Drafting Studio". */
  section?: string;
  /** Called when the person clicks the reset button. */
  onReset?: () => void;
  /** Label for the reset button. Defaults to "Go to overview". */
  resetLabel?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In a real deployment this is where you'd forward to an error-
    // tracking service. Logged to console so it's visible in dev tools
    // rather than silently swallowed.
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ''}]`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[300px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-red-200 rounded-lg shadow-sm p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-sm font-sans font-bold text-slate-900">
              {this.props.section ? `${this.props.section} hit a problem` : 'Something went wrong'}
            </h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              The rest of your workspace is fine — your data is safe. This section failed to render.
            </p>
            {this.state.error.message && (
              <p className="text-[10px] font-mono text-slate-400 mt-2 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 break-words">
                {this.state.error.message}
              </p>
            )}
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={this.retry}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
              {this.props.onReset && (
                <button
                  onClick={() => { this.retry(); this.props.onReset?.(); }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded transition-colors"
                >
                  <Home className="w-3.5 h-3.5" /> {this.props.resetLabel ?? 'Go to overview'}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
