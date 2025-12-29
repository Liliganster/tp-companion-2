import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

export type LegalSection = { title: string; body: Array<string | { label: string; items: string[] }> };

export function PublicLegalLayout(props: {
  language: string;
  title: string;
  subtitle: string;
  sections: LegalSection[];
}) {
  const navigate = useNavigate();
  const { language, title, subtitle, sections } = props;

  const ui = useMemo(() => {
    if (language === "de") {
      return {
        back: "Zurück",
        terms: "Nutzungsbedingungen",
        privacy: "Datenschutz",
        cookies: "Cookies",
        draft: "Entwurf: vor Produktion rechtlich prüfen lassen.",
      };
    }
    if (language === "en") {
      return {
        back: "Back",
        terms: "Terms",
        privacy: "Privacy",
        cookies: "Cookies",
        draft: "Draft: review with legal counsel before production.",
      };
    }
    return {
      back: "Volver",
      terms: "Términos",
      privacy: "Privacidad",
      cookies: "Cookies",
      draft: "Borrador: revisa con asesoría legal antes de producción.",
    };
  }, [language]);

  return (
    <div className="relative min-h-screen bg-background">
      <div className="fixed inset-0 overflow-hidden pointer-events-none app-background-effects z-0">
        <div className="absolute inset-0 app-background-image" />
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-primary/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-accent/5 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            {ui.back}
          </Button>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link className="hover:underline" to="/legal/terms">
              {ui.terms}
            </Link>
            <span>·</span>
            <Link className="hover:underline" to="/legal/privacy">
              {ui.privacy}
            </Link>
            <span>·</span>
            <Link className="hover:underline" to="/legal/cookies">
              {ui.cookies}
            </Link>
          </div>
        </div>

        <header className="mt-6">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-3 text-xs text-muted-foreground">{ui.draft}</div>
        </header>

        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.title} className="glass-card p-5">
              <h2 className="text-lg font-medium">{s.title}</h2>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                {s.body.map((b, idx) => {
                  if (typeof b === "string") return <p key={idx}>{b}</p>;
                  return (
                    <div key={idx}>
                      <div className="text-foreground/90 font-medium">{b.label}</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {b.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

