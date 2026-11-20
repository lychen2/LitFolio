import { renderMarkdown } from "@/lib/markdown";
import "katex/dist/katex.min.css";
import "@/styles/markdown.css";

type MarkdownViewProps = {
  content: string;
  className?: string;
};

export function MarkdownView({ content, className }: MarkdownViewProps) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
