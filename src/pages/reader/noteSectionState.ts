export function nextSectionDraft({
  currentDraft,
  incomingContent,
  dirty,
}: {
  currentDraft: string;
  incomingContent: string;
  dirty: boolean;
}): string {
  return dirty ? currentDraft : incomingContent;
}
