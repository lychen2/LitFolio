import type {
  PdfTextNote,
  PdfTextNoteCreateInput,
  PdfTextNotePatch,
  PdfTextNoteSearchResult,
} from "@/core/contracts";
import { errorMsg } from "@/hooks/useApiMutation";
import { parsePdfTextNote } from "@/lib/apiSchemaReader";

export type PdfTextNoteChanges = Partial<
  Pick<PdfTextNote, "rect" | "content" | "color" | "fontSize" | "opacity">
>;

export interface ReaderAnnotationClient {
  pdfNoteCreate(paperId: string, input: PdfTextNoteCreateInput): Promise<PdfTextNote>;
  pdfNoteList(paperId: string): Promise<PdfTextNote[]>;
  pdfNoteUpdate(id: string, patch: PdfTextNotePatch): Promise<PdfTextNote>;
  pdfNoteDelete(id: string, expectedRevision: number): Promise<void>;
  pdfNoteSearch(query: string, paperId?: string | null): Promise<PdfTextNoteSearchResult[]>;
}

export interface ReaderAnnotationStatus {
  state: "saved" | "pending" | "error";
  error: string | null;
}

export interface ReaderAnnotationSnapshot {
  paperId: string | null;
  notes: PdfTextNote[];
  loading: boolean;
  creating: boolean;
  loadError: string | null;
  createError: string | null;
  statusById: Record<string, ReaderAnnotationStatus>;
}

interface Waiter {
  resolve(note: PdfTextNote): void;
  reject(error: unknown): void;
}

interface NoteQueue {
  persisted: PdfTextNote;
  visible: PdfTextNote;
  pendingPatch: PdfTextNoteChanges | null;
  waiters: Waiter[];
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  error: unknown;
  conflictAttempts: number;
}

interface ControllerOptions {
  debounceMs?: number;
  maxConflictRetries?: number;
}

export class ReaderAnnotationController {
  private readonly queues = new Map<string, NoteQueue>();
  private readonly listeners = new Set<() => void>();
  private readonly debounceMs: number;
  private readonly maxConflictRetries: number;
  private paperId: string | null = null;
  private loading = false;
  private creating = false;
  private loadError: string | null = null;
  private createError: string | null = null;
  private epoch = 0;
  private disposed = false;

  constructor(
    private readonly client: ReaderAnnotationClient,
    options: ControllerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 800;
    this.maxConflictRetries = options.maxConflictRetries ?? 2;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): ReaderAnnotationSnapshot {
    const notes = [...this.queues.values()]
      .map((queue) => queue.visible)
      .sort(compareNotes);
    return {
      paperId: this.paperId,
      notes,
      loading: this.loading,
      creating: this.creating,
      loadError: this.loadError,
      createError: this.createError,
      statusById: Object.fromEntries(
        [...this.queues.entries()].map(([id, queue]) => [id, queueStatus(queue)]),
      ),
    };
  }

  async openPaper(paperId: string): Promise<void> {
    this.assertOpen();
    if (this.paperId && this.paperId !== paperId) {
      await this.flush();
    }
    const epoch = ++this.epoch;
    this.paperId = paperId;
    this.loading = true;
    this.loadError = null;
    this.createError = null;
    this.clearQueues();
    this.emit();
    try {
      const notes = await this.client.pdfNoteList(paperId);
      if (this.disposed || epoch !== this.epoch || this.paperId !== paperId) return;
      for (const note of notes) this.queues.set(note.id, createQueue(note));
    } catch (error) {
      if (this.disposed || epoch !== this.epoch || this.paperId !== paperId) return;
      this.loadError = errorMsg(error);
      throw error;
    } finally {
      if (!this.disposed && epoch === this.epoch && this.paperId === paperId) {
        this.loading = false;
        this.emit();
      }
    }
  }

  async createTextNote(input: PdfTextNoteCreateInput): Promise<PdfTextNote> {
    this.assertOpen();
    if (!this.paperId) throw new Error("Reader annotation controller has no open paper");
    this.creating = true;
    this.createError = null;
    this.emit();
    try {
      const note = await this.client.pdfNoteCreate(this.paperId, input);
      if (note.paperId === this.paperId) {
        this.queues.set(note.id, createQueue(note));
      }
      return note;
    } catch (error) {
      this.createError = errorMsg(error);
      throw error;
    } finally {
      this.creating = false;
      this.emit();
    }
  }

  updateTextNote(
    id: string,
    patch: PdfTextNoteChanges,
    options: { debounce?: boolean } = {},
  ): Promise<PdfTextNote> {
    this.assertOpen();
    const queue = this.requireQueue(id);
    queue.visible = applyPatch(queue.visible, patch);
    queue.pendingPatch = mergePatch(queue.pendingPatch, patch);
    queue.error = null;
    const promise = new Promise<PdfTextNote>((resolve, reject) => {
      queue.waiters.push({ resolve, reject });
    });
    this.schedule(queue, id, options.debounce !== false);
    this.emit();
    return promise;
  }

  async retryTextNote(id: string): Promise<PdfTextNote> {
    this.assertOpen();
    const queue = this.requireQueue(id);
    if (!queue.pendingPatch) return queue.persisted;
    queue.error = null;
    const promise = new Promise<PdfTextNote>((resolve, reject) => {
      queue.waiters.push({ resolve, reject });
    });
    this.schedule(queue, id, false);
    this.emit();
    return promise;
  }

  async deleteTextNote(id: string): Promise<void> {
    this.assertOpen();
    await this.flush(id);
    const queue = this.requireQueue(id);
    await this.client.pdfNoteDelete(id, queue.persisted.revision);
    this.removeQueue(id);
    this.emit();
  }

  searchTextNotes(query: string, paperId = this.paperId): Promise<PdfTextNoteSearchResult[]> {
    this.assertOpen();
    return this.client.pdfNoteSearch(query, paperId);
  }

  async flush(id?: string): Promise<void> {
    const queues = id
      ? [[id, this.requireQueue(id)] as const]
      : [...this.queues.entries()];
    await Promise.all(queues.map(([queueId, queue]) => this.flushQueue(queueId, queue)));
  }

  async close(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.flush();
    } finally {
      this.disposed = true;
      this.epoch += 1;
      for (const queue of this.queues.values()) {
        if (queue.timer) clearTimeout(queue.timer);
      }
      this.emit();
    }
  }

  private schedule(queue: NoteQueue, id: string, debounce: boolean): void {
    if (queue.timer) clearTimeout(queue.timer);
    queue.timer = null;
    if (queue.inFlight) return;
    if (!debounce || this.debounceMs === 0) {
      void this.drain(id, queue);
      return;
    }
    queue.timer = setTimeout(() => {
      queue.timer = null;
      void this.drain(id, queue);
    }, this.debounceMs);
  }

  private async drain(id: string, queue: NoteQueue): Promise<void> {
    if (queue.inFlight || !queue.pendingPatch || queue.error) return;
    const patch = queue.pendingPatch;
    const waiters = queue.waiters;
    queue.pendingPatch = null;
    queue.waiters = [];
    const expectedRevision = queue.persisted.revision;
    const epoch = this.epoch;

    const operation = this.client
      .pdfNoteUpdate(id, { ...patch, expectedRevision })
      .then((saved) => {
        if (this.disposed || epoch !== this.epoch) return;
        if (saved.revision <= expectedRevision) {
          throw new Error("pdf_note_update returned a non-monotonic revision");
        }
        // Clear in-flight before resolving waiters so a status read right
        // after `await updateTextNote(...)` observes "saved", not "pending".
        queue.inFlight = null;
        queue.persisted = saved;
        queue.visible = applyPatch(saved, queue.pendingPatch ?? {});
        queue.error = null;
        queue.conflictAttempts = 0;
        for (const waiter of waiters) waiter.resolve(saved);
      })
      .catch((error: unknown) => {
        if (this.disposed || epoch !== this.epoch) {
          for (const waiter of waiters) waiter.reject(error);
          return;
        }
        const current = conflictCurrent(error);
        if (current && queue.conflictAttempts < this.maxConflictRetries) {
          queue.conflictAttempts += 1;
          queue.persisted = current;
          queue.pendingPatch = mergePatch(patch, queue.pendingPatch ?? {});
          queue.visible = applyPatch(current, queue.pendingPatch);
          queue.waiters = [...waiters, ...queue.waiters];
          return;
        }
        queue.pendingPatch = mergePatch(patch, queue.pendingPatch ?? {});
        queue.visible = applyPatch(queue.persisted, queue.pendingPatch);
        queue.error = error;
        for (const waiter of [...waiters, ...queue.waiters]) waiter.reject(error);
        queue.waiters = [];
      })
      .finally(() => {
        queue.inFlight = null;
        this.emit();
        if (queue.pendingPatch && !queue.error) void this.drain(id, queue);
      });

    queue.inFlight = operation;
    this.emit();
    await operation;
  }

  private async flushQueue(id: string, queue: NoteQueue): Promise<void> {
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }
    while (queue.inFlight || queue.pendingPatch) {
      if (queue.error) throw queue.error;
      if (queue.inFlight) await queue.inFlight;
      else await this.drain(id, queue);
    }
    if (queue.error) throw queue.error;
  }

  private requireQueue(id: string): NoteQueue {
    const queue = this.queues.get(id);
    if (!queue) throw new Error(`PDF text note ${id} is not loaded`);
    return queue;
  }

  private removeQueue(id: string): void {
    const queue = this.queues.get(id);
    if (queue?.timer) clearTimeout(queue.timer);
    this.queues.delete(id);
  }

  private clearQueues(): void {
    for (const [id] of this.queues) this.removeQueue(id);
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Reader annotation controller is closed");
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function createQueue(note: PdfTextNote): NoteQueue {
  return {
    persisted: note,
    visible: note,
    pendingPatch: null,
    waiters: [],
    timer: null,
    inFlight: null,
    error: null,
    conflictAttempts: 0,
  };
}

function applyPatch(note: PdfTextNote, patch: PdfTextNoteChanges): PdfTextNote {
  return { ...note, ...patch };
}

function mergePatch(
  earlier: PdfTextNoteChanges | null,
  later: PdfTextNoteChanges,
): PdfTextNoteChanges {
  return { ...(earlier ?? {}), ...later };
}

function queueStatus(queue: NoteQueue): ReaderAnnotationStatus {
  if (queue.error) return { state: "error", error: errorMsg(queue.error) };
  if (queue.timer || queue.inFlight || queue.pendingPatch) {
    return { state: "pending", error: null };
  }
  return { state: "saved", error: null };
}

function conflictCurrent(error: unknown): PdfTextNote | null {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const value = error as Record<string, unknown>;
  if (value.code !== "annotation_revision_conflict" || !("current" in value)) return null;
  try {
    return parsePdfTextNote(value.current, "annotation_revision_conflict.current");
  } catch {
    return null;
  }
}

function compareNotes(left: PdfTextNote, right: PdfTextNote): number {
  return (
    left.rect.page - right.rect.page ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}
