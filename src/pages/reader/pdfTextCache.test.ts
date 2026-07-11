import { describe, expect, it, vi } from "vitest";
import { pushPdfTextCacheAndInvalidateTranslations } from "./pdfTextCache";

describe("pushPdfTextCacheAndInvalidateTranslations", () => {
  it("writes extracted PDF text and invalidates translated markdown queries", async () => {
    const calls: string[] = [];
    const api = {
      paperSetPdfText: vi.fn(async () => {
        calls.push("set-text");
      }),
    };
    const queryClient = {
      invalidateQueries: vi.fn(async () => {
        calls.push("invalidate");
      }),
    };

    await pushPdfTextCacheAndInvalidateTranslations({
      paperId: "paper-1",
      text: "PDF body text",
      api,
      queryClient,
    });

    expect(api.paperSetPdfText).toHaveBeenCalledWith("paper-1", "PDF body text");
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["paperTranslatedMarkdown", "paper-1"],
    });
    expect(calls).toEqual(["set-text", "invalidate"]);
  });

  it("skips empty extracted text", async () => {
    const api = { paperSetPdfText: vi.fn() };
    const queryClient = { invalidateQueries: vi.fn() };

    await pushPdfTextCacheAndInvalidateTranslations({
      paperId: "paper-1",
      text: "",
      api,
      queryClient,
    });

    expect(api.paperSetPdfText).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});
