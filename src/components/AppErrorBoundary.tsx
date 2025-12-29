import React from "react";
import { Button } from "@/components/ui/button";
import { captureClientError } from "@/lib/sentryClient";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return { hasError: true, message: msg };
  }

  componentDidCatch(error: unknown, info: unknown) {
    captureClientError(error, { react: true, info });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card w-full max-w-lg p-6">
          <h1 className="text-xl font-semibold">Algo ha fallado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La app encontró un error inesperado. Puedes recargar o volver a intentarlo.
          </p>
          {import.meta.env.DEV && this.state.message ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {this.state.message}
            </pre>
          ) : null}
          <div className="mt-5 flex items-center gap-2">
            <Button variant="default" onClick={this.handleReload}>
              Recargar
            </Button>
            <Button variant="outline" onClick={this.handleReset}>
              Reintentar
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Si el problema persiste, revisa tu conexión y configuración (Supabase / API keys) o contacta soporte.
          </p>
        </div>
      </div>
    );
  }
}

