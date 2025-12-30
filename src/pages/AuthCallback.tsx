import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    // Check URL immediately for recovery flag (works for both hash and query)
    const isRecoveryUrl = window.location.href.includes("type=recovery");

    // Listen for Auth events (most reliable for PKCE)
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/auth/reset");
      } else if (event === "SIGNED_IN") {
        // If we found the recovery flag in URL, prefer that over generic sign-in
        if (isRecoveryUrl) {
          navigate("/auth/reset");
        } else {
          // Default to home, but small delay to ensure we don't miss PASSWORD_RECOVERY event
          setTimeout(() => {
             navigate("/");
          }, 0);
        }
      }
    });
    
    // Trigger session check
    supabase?.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        // If no session found and no recovery/event fired, redirect to login
        // We delay slightly to let onAuthStateChange have a chance if it's firing
        setTimeout(() => {
             navigate("/auth");
        }, 500);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Verifying authentication...</p>
      </div>
    </div>
  );
}
