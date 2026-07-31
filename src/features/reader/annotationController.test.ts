import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PdfTextNote,
  PdfTextNoteCreateInput,
  PdfTextNotePatch,
  PdfTextNoteSearchResult,
} from "@/core/contracts";
import {
  ReaderAnnotationController,
  type ReaderAnnotationClient,
} from "./annotationController";

function note(overrides: Partial<PdfTextNote> = {}): PdfTextNote {
  return {
    kind: "text-note",
    id: "note-1",
    paperId: "paper-1",
    rect: { page: 1, x: 10, y: 20, width: 220, height: 120 },
    content: "initial",
    color: "#fff3a3",
    fontSize: 12,
    opacity: 0.9,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function client(overrides: Partial<ReaderAnnotationClient> = {}): ReaderAnnotationClient {
  return {
    pdfNoteCreate: vi.fn(async (_paperId: string, input: PdfTextNoteCreateInput) => note({
      content: input.content,
      rect: input.rect,
    })),
    pdfNoteList: vi.fn(async (paperId: string) => paperId === "paper-1" ? [note()] : []),
    pdfNoteUpdate: vi.fn(async (_id: string, patch: PdfTextNotePatch) => note({
      ...patch,
      revision: patch.expectedRevision + 1,
    })),
    pdfNoteDelete: vi.fn(async () => undefined),
    pdfNoteSearch: vi.fn(async (): Promise<PdfTextNoteSearchResult[]> => []),
    ...overrides,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ReaderAnnotationController", () => {
  it("coalesces debounced text changes and reports saved only after persistence", async () => {
    const save = deferred<PdfTextNote>();
    const api = client({ pdfNoteUpdate: vi.fn(() => save.promise) });
    const controller = new ReaderAnnotationController(api, { debounceMs: 500 });
    await controller.openPaper("paper-1");

    let resolved = false;
    void controller.updateTextNote("note-1", { content: "draft 1" }).then(() => { resolved = true; });
    const latest = controller.updateTextNote("note-1", { content: "draft 2" });
    expect(controller.snapshot().notes[0].content).toBe("draft 2");
    expect(controller.snapshot().statusById["note-1"].state).toBe("pending");

    await vi.advanceTimersByTimeAsync(500);
    expect(api.pdfNoteUpdate).toHaveBeenCalledTimes(1);
    expect(api.pdfNoteUpdate).toHaveBeenCalledWith("note-1", {
      content: "draft 2",
      expectedRevision: 0,
    });
    expect(resolved).toBe(false);

    save.resolve(note({ content: "draft 2", revision: 1 }));
    await latest;
    expect(resolved).toBe(true);
    expect(controller.snapshot().statusById["note-1"].state).toBe("saved");
  });

  it("serializes interleaved text and geometry writes with monotonic revisions", async () => {
    const first = deferred<PdfTextNote>();
    const second = deferred<PdfTextNote>();
    const update = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = new ReaderAnnotationController(client({ pdfNoteUpdate: update }), { debounceMs: 0 });
    await controller.openPaper("paper-1");

    const textSave = controller.updateTextNote("note-1", { content: "latest" }, { debounce: false });
    const movedRect = { ...note().rect, x: 80 };
    const geometrySave = controller.updateTextNote("note-1", { rect: movedRect }, { debounce: false });
    expect(update).toHaveBeenCalledTimes(1);

    first.resolve(note({ content: "latest", revision: 1 }));
    await textSave;
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith("note-1", {
      rect: movedRect,
      expectedRevision: 1,
    });

    second.resolve(note({ content: "latest", rect: movedRect, revision: 2 }));
    await geometrySave;
    expect(controller.snapshot().notes[0].revision).toBe(2);
  });

  it("rebases pending changes on a structured revision conflict and retries", async () => {
    const update = vi.fn()
      .mockRejectedValueOnce({
        code: "annotation_revision_conflict",
        current: note({ content: "remote", revision: 1 }),
      })
      .mockResolvedValueOnce(note({ content: "local", revision: 2 }));
    const controller = new ReaderAnnotationController(client({ pdfNoteUpdate: update }), { debounceMs: 0 });
    await controller.openPaper("paper-1");

    await controller.updateTextNote("note-1", { content: "local" }, { debounce: false });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith("note-1", {
      content: "local",
      expectedRevision: 1,
    });
    expect(controller.snapshot().notes[0].content).toBe("local");
    expect(controller.snapshot().notes[0].revision).toBe(2);
  });

  it("retains unsaved state after failure and persists it on explicit retry", async () => {
    const update = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(note({ content: "unsaved", revision: 1 }));
    const controller = new ReaderAnnotationController(client({ pdfNoteUpdate: update }), { debounceMs: 0 });
    await controller.openPaper("paper-1");

    await expect(controller.updateTextNote("note-1", { content: "unsaved" }, { debounce: false }))
      .rejects.toThrow("disk full");
    expect(controller.snapshot().notes[0].content).toBe("unsaved");
    expect(controller.snapshot().statusById["note-1"]).toEqual({
      state: "error",
      error: "disk full",
    });

    await controller.retryTextNote("note-1");
    expect(controller.snapshot().statusById["note-1"].state).toBe("saved");
  });

  it("flushes before close and before switching papers", async () => {
    const api = client();
    const controller = new ReaderAnnotationController(api, { debounceMs: 10_000 });
    await controller.openPaper("paper-1");
    const pending = controller.updateTextNote("note-1", { content: "before switch" });

    await controller.openPaper("paper-2");
    await pending;
    expect(api.pdfNoteUpdate).toHaveBeenCalledWith("note-1", {
      content: "before switch",
      expectedRevision: 0,
    });
    expect(controller.snapshot().paperId).toBe("paper-2");

    await controller.close();
    expect(() => controller.updateTextNote("note-1", { content: "closed" }))
      .toThrow("controller is closed");
  });
});
