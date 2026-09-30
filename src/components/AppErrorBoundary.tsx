import { uiText as t } from "@/lib/ui-language";
import React from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

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
    logger.error("[AppErrorBoundary] React render error", error, { react: true, info });

    // Recovery is always explicit: a loading failure must not reload other work.
    const message = error instanceof Error ? error.message : String(error);
    if (/dynamically imported module|module script|Loading chunk/i.test(message)) {
      window.__appRecovery?.show();
    }
  }

  private handleReload = () => {
    if (window.__appRecovery) void window.__appRecovery.recover();
    else if (window.confirm(t("ui.reloadConfirm"))) window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card w-full max-w-lg p-6">
          <h1 className="text-xl font-semibold">{t("ui.errorTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ui.errorBody")}
          </p>
          {import.meta.env.DEV && this.state.message ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {this.state.message}
            </pre>
          ) : null}
          <div className="mt-5 flex items-center gap-2">
            <Button variant="default" onClick={this.handleReload}>
              {t("ui.reload")}
            </Button>
            <Button variant="outline" onClick={this.handleReset}>
              {t("ui.retry")}
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("ui.errorSupport")}
          </p>
        </div>
      </div>
    );
  }
}
