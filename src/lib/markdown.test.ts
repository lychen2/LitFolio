import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("escapes raw HTML in paragraphs", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");

    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
  });

  it("escapes raw HTML in markdown table cells", () => {
    const html = renderMarkdown("| A | B |\n|---|---|\n| <b>x</b> | <script>alert(1)</script> |");

    expect(html).toContain("<table");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders katex without trusting raw HTML", () => {
    const html = renderMarkdown("$x < y$");

    expect(html).toContain("katex");
    expect(html).not.toContain("< y");
  });

  it("renders bracketed latex delimiters commonly returned by translators", () => {
    const html = renderMarkdown("inline \\(x_i^2\\)\n\n\\[\\sum_i x_i\\]");

    expect(html.match(/katex/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("\\(");
    expect(html).not.toContain("\\[");
  });

  it("keeps fenced code escaped when the fence is not closed", () => {
    const html = renderMarkdown("```ts\nconst x = \"<script>\";");

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
