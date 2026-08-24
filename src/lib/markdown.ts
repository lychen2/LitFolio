/**
 * Lightweight markdown-to-HTML for AI-generated answers.
 * No external deps — safe (never renders raw user HTML), covers the
 * formatting the LLM actually produces: bold, italic, lists, headings,
 * code blocks, blockquotes, and LaTeX formulas (via KaTeX).
 */

import katex from "katex";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, '<code class="bg-litera-panel px-1 py-0.5 rounded text-xs font-mono">$1</code>');
  return out;
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s-:|]+\|$/.test(line.trim());
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function renderTable(rows: string[][]): string {
  const [head, ...body] = rows;
  const header = head
    .map((cell) => `<th class="border border-litera-line px-3 py-2 text-left">${renderInline(cell)}</th>`)
    .join("");
  const bodyRows = body
    .map((row) => {
      const cells = row
        .map((cell) => `<td class="border border-litera-line px-3 py-2 align-top">${renderInline(cell)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table class="w-full border-collapse text-sm my-3"><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

/**
 * Render a LaTeX formula string to safe HTML. Returns the original text
 * wrapped in a code span on error (so the user can see what went wrong
 * instead of a blank gap).
 */
function tryRenderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return displayMode
      ? `<pre class="bg-litera-error/10 border border-litera-error/30 rounded-md p-2 text-xs overflow-auto my-2"><code>$$ ${escapeHtml(tex)} $$</code></pre>`
      : `<code class="text-litera-error">$${escapeHtml(tex)}$</code>`;
  }
}

/**
 * Pick a unique placeholder for each math block so replacement is
 * deterministic and safe — no risk of placeholder collisions with the
 * surrounding prose.
 */
let placeholderSeq = 0;
function nextPlaceholder(kind: "block" | "inline"): string {
  placeholderSeq++;
  return kind === "block"
    ? `\x00MATHBLOCK${placeholderSeq}\x00`
    : `\x00MATHINLINE${placeholderSeq}\x00`;
}

/**
 * Replace LaTeX formulas with NUL-placeholders that are guaranteed not to
 * appear in normal text. Returns the stripped text and a map from
 * placeholder → rendered HTML.
 */
function extractMath(text: string): { stripped: string; math: Map<string, string> } {
  placeholderSeq = 0;
  const math = new Map<string, string>();

  // 1) $$ display math $$  (multi-line)
  let stripped = text.replace(/\$\$([\s\S]*?)\$\$/g, (_full, tex: string) => {
    const ph = nextPlaceholder("block");
    math.set(ph, tryRenderKatex(tex, true));
    return ph;
  });

  // 2) \[ display math \]  (multi-line)
  stripped = stripped.replace(/\\\[([\s\S]*?)\\\]/g, (_full, tex: string) => {
    const ph = nextPlaceholder("block");
    math.set(ph, tryRenderKatex(tex, true));
    return ph;
  });

  // 3) \( inline math \)  (single-line)
  stripped = stripped.replace(/\\\((.+?)\\\)/g, (_full, tex: string) => {
    const ph = nextPlaceholder("inline");
    math.set(ph, tryRenderKatex(tex, false));
    return ph;
  });

  // 4) $ inline math $  (single-line, no `$` inside)
  stripped = stripped.replace(/\$(.+?)\$/g, (_full, tex: string) => {
    const ph = nextPlaceholder("inline");
    math.set(ph, tryRenderKatex(tex, false));
    return ph;
  });

  return { stripped, math };
}

export function renderMarkdown(md: string): string {
  const { stripped, math } = extractMath(md);

  const lines = stripped.split("\n");
  const html: string[] = [];
  let inList: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Code fence block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = escapeHtml(codeLines.join("\n"));
      html.push(
        `<pre class="bg-litera-ink/40 rounded-md p-3 text-xs overflow-auto my-2"><code>${code}</code></pre>`,
      );
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = renderInline(headingMatch[2].trim());
      html.push(
        `<h${level + 2} class="text-sm font-medium text-litera-text mt-4 mb-1">${text}</h${level + 2}>`,
      );
      i++;
      continue;
    }

    // Markdown table
    if (isTableLine(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      if (inList) {
        html.push(inList === "ol" ? "</ol>" : "</ul>");
        inList = null;
      }
      const tableRows = [splitTableCells(line)];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) {
        tableRows.push(splitTableCells(lines[i]));
        i++;
      }
      html.push(renderTable(tableRows));
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s?(.+)/);
    if (quoteMatch) {
      if (inList) {
        html.push(inList === "ol" ? "</ol>" : "</ul>");
        inList = null;
      }
      html.push(
        `<blockquote class="border-l-2 border-litera-accent/40 pl-3 my-2 text-xs text-litera-mute italic">${renderInline(quoteMatch[1].trim())}</blockquote>`,
      );
      i++;
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (inList !== "ul") {
        if (inList) {
          html.push(inList === "ol" ? "</ol>" : "</ul>");
        }
        html.push('<ul class="list-disc list-inside space-y-0.5 my-1 text-sm">');
        inList = "ul";
      }
      html.push(`<li>${renderInline(bulletMatch[1].trim())}</li>`);
      i++;
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (inList !== "ol") {
        if (inList) {
          html.push(inList === "ol" ? "</ol>" : "</ul>");
        }
        html.push('<ol class="list-decimal list-inside space-y-0.5 my-1 text-sm">');
        inList = "ol";
      }
      html.push(`<li>${renderInline(numMatch[1].trim())}</li>`);
      i++;
      continue;
    }

    // Non-list line — close any open list
    if (inList) {
      html.push(inList === "ol" ? "</ol>" : "</ul>");
      inList = null;
    }

    // Empty line → paragraph break
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph
    html.push(
      `<p class="text-sm leading-relaxed my-1">${renderInline(line.trim())}</p>`,
    );
    i++;
  }

  if (inList) {
    html.push(inList === "ol" ? "</ol>" : "</ul>");
  }

  // Restore math placeholders with rendered KaTeX
  let result = html.join("\n");
  for (const [ph, rendered] of math) {
    result = result.split(ph).join(rendered);
  }

  return result;
}
