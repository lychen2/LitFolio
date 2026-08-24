import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";

type Props = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to devtools — tauri webview console mirrors this.
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return <DefaultFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const t = useT();
  return (
    <div className="h-full w-full grid place-items-center px-6 py-10 text-litera-mute">
      <div className="max-w-md text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-litera-error/10 text-litera-error">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="font-serif text-xl tracking-tight text-litera-text">
          {t("errors.pageCrashed")}
        </h2>
        <p className="text-sm text-litera-text/70 break-words">
          {error.message || t("errors.unexpected")}
        </p>
        <button
          onClick={onReset}
          className="litera-btn-primary text-sm inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
}
