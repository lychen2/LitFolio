/**
 * Lightweight markdown-to-HTML for AI-generated answers.
 * No external deps — safe (never renders raw user HTML), covers the
 * formatting the LLM actually produces: bold, italic, lists, headings.
 */

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
  out = out.replace(/`([^`]+)`/g, "<code class=\"bg-litera-panel px-1 py-0.5 rounded text-xs font-mono\">$1</code>");
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
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
      html.push(`<pre class="bg-litera-ink/40 rounded-md p-3 text-xs overflow-auto my-2"><code>${code}</code></pre>`);
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = renderInline(headingMatch[2].trim());
      html.push(`<h${level + 2} class="text-sm font-medium text-litera-text mt-4 mb-1">${text}</h${level + 2}>`);
      i++;
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (inList !== "ul") {
        if (inList) { html.push(inList === "ol" ? "</ol>" : "</ul>"); }
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
        if (inList) { html.push(inList === "ol" ? "</ol>" : "</ul>"); }
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
    html.push(`<p class="text-sm leading-relaxed my-1">${renderInline(line.trim())}</p>`);
    i++;
  }

  if (inList) {
    html.push(inList === "ol" ? "</ol>" : "</ul>");
  }

  return html.join("\n");
}
