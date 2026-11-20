import { useRef, useState } from "react";
import { aiReaderApi } from "@/lib/apiAiReader";
import { errorMessageOr } from "@/lib/error";
import type { LiteratureNetwork, LiteratureNetworkEvidence, LiteratureNetworkNode } from "./network";

type WorkTitle = Pick<LiteratureNetworkNode | LiteratureNetworkEvidence, "id" | "title">;

type TranslationState = {
  result: LiteratureNetwork;
  translations: ReadonlyMap<string, string>;
} & (
  | { status: "translating" }
  | { status: "failed"; error: string }
  | { status: "ready"; translatedResult: LiteratureNetwork; showingTranslation: boolean }
);

function collectTitles(result: LiteratureNetwork) {
  const titleByWork = new Map<string, string>();
  const remember = ({ id, title }: WorkTitle) => {
    const original = title.trim();
    // The graph can use the work ID as the label when a title is unavailable.
    if (original && original !== id && !titleByWork.has(id)) {
      titleByWork.set(id, original);
    }
  };
  result.nodes.forEach(remember);
  for (const edge of result.edges) edge.evidence.forEach(remember);
  return titleByWork;
}

function deriveDisplayResult(
  result: LiteratureNetwork,
  titleByWork: ReadonlyMap<string, string>,
  translations: ReadonlyMap<string, string>,
): LiteratureNetwork {
  function translateWork<T extends WorkTitle>(work: T): T {
    const original = titleByWork.get(work.id);
    const title = original === undefined ? undefined : translations.get(original);
    return title === undefined || title === work.title ? work : { ...work, title };
  }

  return {
    ...result,
    nodes: result.nodes.map(translateWork),
    edges: result.edges.map((edge) => {
      const evidence = edge.evidence.map(translateWork);
      return evidence.every((work, index) => work === edge.evidence[index])
        ? edge
        : { ...edge, evidence };
    }),
  };
}

export function useNetworkTitleTranslation(result: LiteratureNetwork) {
  const [state, setState] = useState<TranslationState | null>(null);
  const pending = useRef<TranslationState | null>(null);
  const current = state?.result === result ? state : null;
  const showingTranslation = current?.status === "ready" && current.showingTranslation;

  function toggle(): void {
    if (current?.status === "ready") {
      setState({ ...current, showingTranslation: !current.showingTranslation });
      return;
    }
    if (pending.current?.result === result) return;

    const titleByWork = collectTitles(result);
    if (titleByWork.size === 0) return;
    const translations = new Map(current?.translations);
    const titles = [...new Set(titleByWork.values())].filter((title) => !translations.has(title));
    const request: TranslationState = { result, translations, status: "translating" };
    pending.current = request;
    setState(request);

    void aiReaderApi.literatureNetworkTranslateTitles(titles).then((reply) => {
      const received = new Map(translations);
      reply.forEach((title, index) => {
        if (title !== null) received.set(titles[index], title);
      });
      if (received.size < translations.size + titles.length) {
        return {
          result,
          translations: received,
          status: "failed",
          error: "Some titles could not be translated. Try again.",
        } satisfies TranslationState;
      }
      return {
        result,
        translations: received,
        status: "ready",
        translatedResult: deriveDisplayResult(result, titleByWork, received),
        showingTranslation: true,
      } satisfies TranslationState;
    }).catch((error: unknown) => ({
      result,
      translations,
      status: "failed" as const,
      error: errorMessageOr(error, "Title translation failed. Try again."),
    })).then((next) => {
      if (pending.current === request) pending.current = null;
      setState((latest) => latest === request ? next : latest);
    });
  }

  return {
    displayResult: showingTranslation ? current.translatedResult : result,
    translating: current?.status === "translating",
    showingTranslation,
    error: current?.status === "failed" ? current.error : null,
    toggle,
  };
}
