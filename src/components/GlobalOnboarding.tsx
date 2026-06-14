import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FolderOpen, FileText, Brain, FolderKanban, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const STORAGE_KEY = "litera.onboarding.completed";

interface OnboardingStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  actionRoute?: string;
  checkCompleted: () => boolean;
}

export function GlobalOnboarding() {
  const t = useT();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  // Query to check completion status
  const papersQ = useQuery({
    queryKey: ["papers", "list", null, null, ""],
    queryFn: () => api.papersRecent(1),
    enabled: show,
  });

  const llmConfigQ = useQuery({
    queryKey: ["llm", "config"],
    queryFn: api.llmGetConfig,
    enabled: show,
  });

  const projectsQ = useQuery({
    queryKey: ["projects"],
    queryFn: api.projectsList,
    enabled: show,
  });

  const hasPapers = (papersQ.data?.length ?? 0) > 0;
  const hasProfiles = (llmConfigQ.data?.profiles?.length ?? 0) > 0;
  const hasProjects = (projectsQ.data?.length ?? 0) > 0;

  const steps: OnboardingStep[] = [
    {
      id: "library",
      icon: <FolderOpen className="h-5 w-5" />,
      title: t("onboarding.step1"),
      description: t("onboarding.step1Desc"),
      checkCompleted: () => true, // Library is always created on first launch
    },
    {
      id: "import",
      icon: <FileText className="h-5 w-5" />,
      title: t("onboarding.step2"),
      description: t("onboarding.step2Desc"),
      action: t("onboarding.goToImport"),
      actionRoute: "/import",
      checkCompleted: () => hasPapers,
    },
    {
      id: "llm",
      icon: <Brain className="h-5 w-5" />,
      title: t("onboarding.step3"),
      description: t("onboarding.step3Desc"),
      action: t("onboarding.goToSettings"),
      actionRoute: "/settings",
      checkCompleted: () => hasProfiles,
    },
    {
      id: "project",
      icon: <FolderKanban className="h-5 w-5" />,
      title: t("onboarding.step4"),
      description: t("onboarding.step4Desc"),
      action: t("onboarding.goToProjects"),
      actionRoute: "/projects",
      checkCompleted: () => hasProjects,
    },
  ];

  const allCompleted = steps.every((step) => step.checkCompleted());

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") {
        setShow(true);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  useEffect(() => {
    if (show && allCompleted) {
      // Auto-dismiss when all steps are completed
      handleDismiss();
    }
  }, [show, allCompleted]);

  const handleDismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handleSkip = () => {
    handleDismiss();
  };

  const handleAction = (route?: string) => {
    if (route) {
      navigate(route);
      handleDismiss();
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center p-4">
      <div
        className="relative litera-panel p-6 max-w-lg w-full space-y-4 litera-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1 text-litera-mute hover:text-litera-text transition-colors"
          aria-label={t("onboarding.skip")}
        >
          <X className="h-5 w-5" />
        </button>

        <div>
          <h2 className="font-serif text-xl text-litera-text">
            {t("onboarding.title")}
          </h2>
          <p className="text-sm text-litera-mute mt-1">
            {t("onboarding.subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step) => {
            const completed = step.checkCompleted();
            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  completed
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-litera-border bg-litera-surface"
                }`}
              >
                <div
                  className={`shrink-0 flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                    completed
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-litera-accent/10 text-litera-accent"
                  }`}
                >
                  {completed ? <Check className="h-5 w-5" /> : step.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-litera-text">
                      {step.title}
                    </h3>
                    {completed && (
                      <span className="text-xs text-emerald-400">
                        {t("onboarding.completed")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-litera-mute mt-0.5">
                    {step.description}
                  </p>

                  {!completed && step.action && (
                    <button
                      onClick={() => handleAction(step.actionRoute)}
                      className="mt-2 text-xs text-litera-accent hover:text-litera-accent2 transition-colors"
                    >
                      {step.action} →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={handleSkip}
            className="litera-btn text-sm px-4 py-1.5"
          >
            {t("onboarding.skip")}
          </button>
          {allCompleted && (
            <button
              onClick={handleDismiss}
              className="litera-btn-primary text-sm px-4 py-1.5"
            >
              {t("onboarding.done")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
