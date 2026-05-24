import { useParams } from "react-router-dom";

export function ReaderPage() {
  const { paperId } = useParams();
  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-3">
        <h1 className="font-serif text-lg tracking-tight">阅读 · {paperId}</h1>
      </header>
      <div className="flex-1 grid grid-cols-[260px_1fr_360px]">
        <div className="border-r border-litera-line bg-litera-paper/30 p-3 text-sm text-litera-mute">列表</div>
        <div className="bg-litera-ink p-3 text-sm text-litera-mute">PDF 阅读器</div>
        <div className="border-l border-litera-line bg-litera-paper/30 p-3 text-sm text-litera-mute">笔记</div>
      </div>
    </section>
  );
}
