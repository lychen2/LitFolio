import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectWritingError } from "./ProjectWritingPanel";

describe("ProjectWritingError", () => {
  it("shows the concrete render command failure", () => {
    const html = renderToString(<ProjectWritingError error={new Error("render failed: missing note") } />);

    expect(html).toContain("render failed: missing note");
    expect(html).toContain('role="alert"');
  });
});
