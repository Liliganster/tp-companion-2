import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

let scriptPromise: Promise<void> | undefined;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      const timeout = window.setTimeout(() => fail(), 15000);
      const fail = () => {
        window.clearTimeout(timeout);
        script.remove();
        scriptPromise = undefined;
        reject(new Error("Captcha unavailable"));
      };
      script.onload = () => { window.clearTimeout(timeout); resolve(); };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export function AuthCaptcha({ siteKey, onToken }: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let widget: string | undefined;
    onToken("");
    setFailed(false);
    loadScript().then(() => {
      if (disposed || !container.current) return;
      widget = window.turnstile!.render(container.current, {
        sitekey: siteKey, size: "flexible", theme: "auto",
        callback: (token: string) => { if (!disposed) { setFailed(false); onToken(token); } },
        "expired-callback": () => { if (!disposed) onToken(""); },
        "error-callback": () => { if (!disposed) { onToken(""); setFailed(true); } },
        "timeout-callback": () => { if (!disposed) { onToken(""); setFailed(true); } },
      });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (widget !== undefined) window.turnstile?.remove(widget); };
  }, [siteKey, onToken, attempt]);
  return <div className="space-y-2">
    <div ref={container} />
    {failed && <div role="alert" className="text-sm text-destructive">
      No se pudo completar la verificación de seguridad. Comprueba tu conexión.
      <button type="button" className="ml-2 underline" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>
    </div>}
  </div>;
}
