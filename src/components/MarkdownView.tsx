import { renderMarkdown } from "@/lib/markdown";

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
