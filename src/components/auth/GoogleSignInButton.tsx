import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce: string;
    ux_mode: "popup";
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      shape: "rectangular";
      text: "signin_with" | "signup_with";
      logo_alignment: "left";
      width: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityApi;
      };
    };
  }
}

let googleIdentityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error("Google Identity Services no se pudo inicializar."));
    };
    const handleError = () => reject(new Error("No se pudo cargar el acceso seguro de Google."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleIdentityScriptPromise = null;
    throw error;
  });

  return googleIdentityScriptPromise;
}

async function createNoncePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const encoded = new TextEncoder().encode(nonce);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hashedNonce = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { nonce, hashedNonce };
}

type GoogleSignInButtonProps = {
  disabled?: boolean;
  isSignUp?: boolean;
  onCredential: (idToken: string, nonce: string) => Promise<void> | void;
  onError: (error: Error) => void;
};

export function GoogleSignInButton({ disabled = false, isSignUp = false, onCredential, onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    setInitializing(true);

    const initialize = async () => {
      const clientId = String(
        import.meta.env.VITE_GOOGLE_LOGIN_CLIENT_ID
        ?? import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID
        ?? "",
      ).trim();
      if (!clientId) throw new Error("Falta VITE_GOOGLE_LOGIN_CLIENT_ID en la configuración de la aplicación.");

      const [{ nonce, hashedNonce }] = await Promise.all([createNoncePair(), loadGoogleIdentityScript()]);
      if (cancelled || !containerRef.current) return;

      const googleIdentity = window.google?.accounts?.id;
      if (!googleIdentity) throw new Error("Google Identity Services no está disponible.");

      googleIdentity.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        ux_mode: "popup",
        use_fedcm_for_prompt: true,
        callback: (response) => {
          if (!response.credential) {
            onErrorRef.current(new Error("Google no devolvió una credencial válida."));
            return;
          }
          void Promise.resolve(onCredentialRef.current(response.credential, nonce)).catch((error) => {
            onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
          });
        },
      });

      containerRef.current.replaceChildren();
      const buttonWidth = Math.min(
        400,
        Math.max(200, Math.round(containerRef.current.getBoundingClientRect().width)),
      );

      googleIdentity.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: isSignUp ? "signup_with" : "signin_with",
        logo_alignment: "left",
        width: buttonWidth,
      });

      // Google añade 10 px laterales y 2 px verticales dentro de su iframe.
      // Recortarlos evita el efecto visual de un botón dentro de otro sin
      // modificar el botón oficial ni interferir con su área clicable.
      const iframe = containerRef.current.querySelector("iframe");
      if (iframe) {
        iframe.style.marginLeft = "-10px";
        iframe.style.marginTop = "-2px";
      }
      setInitializing(false);
    };

    void initialize().catch((error) => {
      if (cancelled) return;
      setInitializing(false);
      onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
    });

    return () => {
      cancelled = true;
    };
  }, [isSignUp]);

  return (
    <div className="relative mt-6 h-10 w-full overflow-hidden rounded-md">
      {initializing && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md border border-border bg-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Google" />
        </div>
      )}
      <div
        ref={containerRef}
        className={`h-10 w-full overflow-hidden ${disabled ? "pointer-events-none opacity-50" : ""}`}
      />
    </div>
  );
}
