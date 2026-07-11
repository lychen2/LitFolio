export function toggleLibrarySelection(selectedIds: ReadonlySet<string>, paperId: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(paperId)) {
    next.delete(paperId);
    return next;
  }
  next.add(paperId);
  return next;
}
