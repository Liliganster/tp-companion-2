import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Route, BarChart3, Leaf, ChevronRight } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useMemo } from "react";
import type { I18nKey } from "@/lib/i18n";

const advancedSections: Array<{
  id: string;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
  icon: typeof Route;
  color: string;
  bgColor: string;
  path: string;
}> = [
  {
    id: "routes",
    titleKey: "advanced.routesTitle",
    descriptionKey: "advanced.routesBody",
    icon: Route,
    color: "text-primary",
    bgColor: "bg-primary/10",
    path: "/advanced/routes",
  },
  {
    id: "costs",
    titleKey: "advanced.costsTitle",
    descriptionKey: "advanced.costsBody",
    icon: BarChart3,
    color: "text-yellow-400",
    bgColor: "bg-accent/10",
    path: "/advanced/costs",
  },
  {
    id: "emissions",
    titleKey: "advanced.emissionsTitle",
    descriptionKey: "advanced.emissionsBody",
    icon: Leaf,
    color: "text-success",
    bgColor: "bg-success/10",
    path: "/advanced/emissions",
  },
];

export default function Advanced() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const resolvedSections = useMemo(
    () =>
      advancedSections.map((s) => ({
        ...s,
        title: t(s.titleKey),
        description: t(s.descriptionKey),
      })),
    [t],
  );

  return (
    <MainLayout>
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-bold">{t("advanced.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("advanced.subtitle")}
          </p>
        </div>

        {/* Section Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in animation-delay-100">
          {resolvedSections.map((section) => (
            <button
              key={section.id}
              onClick={() => navigate(section.path)}
              className="glass-card p-6 text-left hover:bg-secondary/40 transition-all duration-200 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-md ${section.bgColor} shadow-md ring-1 ring-inset ring-white/10`}>
                  <section.icon className={`w-6 h-6 ${section.color} drop-shadow-sm`} />
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="font-semibold text-lg mb-2">{section.title}</h2>
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
