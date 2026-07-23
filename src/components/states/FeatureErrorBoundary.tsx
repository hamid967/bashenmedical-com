/**
 * Phase 1 — feature-level error boundary. Wrap any subtree (dashboard
 * widget, portal card, admin panel) to contain runtime failures without
 * tearing down the whole route. Emits a structured, PII-free log to the
 * console with a correlation id; the on-screen fallback uses the shared
 * `ErrorState` primitive so styling stays in the design system.
 *
 * Do NOT log request bodies, patient identifiers, tokens, or medical
 * details — only the error name/message and a random correlation id.
 */
import * as React from "react";
import { ErrorState } from "./index";

interface Props {
  children: React.ReactNode;
  /** Short, non-PII label identifying the feature area for logs. */
  feature: string;
  /** Optional custom fallback renderer. */
  fallback?: (args: { error: Error; reset: () => void; correlationId: string }) => React.ReactNode;
}

interface State {
  error: Error | null;
  correlationId: string;
}

function makeId() {
  // Small correlation id — enough entropy to grep for in logs, cheap to compute.
  return Math.random().toString(36).slice(2, 10);
}

export class FeatureErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, correlationId: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, correlationId: makeId() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Structured, PII-free log. Keep it a single line for easy filtering.
    // eslint-disable-next-line no-console
    console.error("[feature-error]", {
      feature: this.props.feature,
      correlationId: this.state.correlationId,
      name: error.name,
      message: error.message,
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  reset = () => this.setState({ error: null, correlationId: "" });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.reset,
          correlationId: this.state.correlationId,
        });
      }
      return <ErrorState onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
