/**
 * One host-side signal that the paper set the upstream page shows has changed.
 *
 * Host tools write papers (status, tags, folders, attached PDF, delete,
 * generated TL;DR, translation, queue) through the same commands the framed
 * page lists from. Its document fetched that list earlier, so it reloads on
 * this signal; both the writing surfaces and the frame subscribe here, which
 * keeps the refresh path single.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Tell every host surface and the framed page that the paper set changed. */
export function notifyLibraryChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeLibraryChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
