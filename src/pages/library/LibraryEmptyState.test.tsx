import { describe, expect, it } from "vitest";
import { libraryEmptyActions } from "../LibraryPage";

describe("libraryEmptyActions", () => {
  it("explains the import entry points when the library is empty", () => {
    const actions = libraryEmptyActions((key) => key);

    expect(actions.map((action) => action.label)).toEqual([
      "library.emptyImportPdf",
      "library.emptyAddIdentifier",
      "library.emptyStartTopic",
      "library.emptyTrackFeeds",
    ]);
    expect(actions.map((action) => action.to)).toEqual([
      "/import?tab=pdf",
      "/import?tab=arxiv_doi",
      "/topic",
      "/feeds",
    ]);
  });
});
