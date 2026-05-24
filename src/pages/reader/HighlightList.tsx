import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Highlighter, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { api, type Highlight } from "@/lib/api";

/**
 * Left-pane list of all highlights for the current paper. Each row:
 * - shows the highlighted text + page number
 * - click to scroll the PDF pane to that highlight (via onJump)
 * - click 💬 to inline-edit the per-highlight note (stored in highlights.note)
 * - click 🗑 to delete (confirms)
 */
export function HighlightList({
  paperId, onJump,
}: {
  paperId: string;
  onJump: (h: Highlight) => void;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["highlights", paperId],
    queryFn: () => api.highlightList(paperId),
  });

  return (
    <aside className="h-full flex flex-col bg-litera-paper/30 border-r border-litera-line">
      <div className="px-3 py-2 border-b border-litera-line flex items-center gap-1.5 text-xs uppercase tracking-wider text-litera-mute">
        <Highlighter className="h-3.5 w-3.5 text-amber-400" /> 高亮
        <span className="ml-auto text-litera-mute normal-case tracking-normal">
          {list.data ? `${list.data.length}` : "…"}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {list.isLoading ? (
          <div className="text-xs text-litera-mute text-center mt-8 flex items-center justify-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> 加载中…
          </div>
        ) : !list.data || list.data.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-litera-mute">
            在 PDF 中选中文字然后点 <span className="text-amber-400">添加高亮</span> 即可
          </div>
        ) : (
          <ul className="divide-y divide-litera-line">
            {list.data.map((h) => (
              <HighlightRow
                key={h.id}
                h={h}
                onJump={() => onJump(h)}
                onDelete={() =>
                  api.highlightDelete(h.id)
                    .then(() => qc.invalidateQueries({ queryKey: ["highlights", paperId] }))
                }
                onSaveNote={(note) =>
                  api.highlightUpdateNote(h.id, note || null)
                    .then(() => qc.invalidateQueries({ queryKey: ["highlights", paperId] }))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function HighlightRow({
  h, onJump, onDelete, onSaveNote,
}: {
  h: Highlight;
  onJump: () => void;
  onDelete: () => void;
  onSaveNote: (note: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(h.note ?? "");
  const save = useMutation({ mutationFn: (n: string) => onSaveNote(n).then(() => { setEditing(false); }) });

  return (
    <li className="px-3 py-2.5 hover:bg-litera-panel/40 transition-colors group">
      <button onClick={onJump} className="text-left w-full">
        <div className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-0.5">
          第 {h.page} 页
        </div>
        <div className="text-xs text-litera-text leading-relaxed line-clamp-3">
          {h.text || "(无文本)"}
        </div>
        {h.note && !editing && (
          <div className="mt-1.5 text-[11px] text-litera-accent2/90 italic flex items-start gap-1">
            <MessageSquare className="h-2.5 w-2.5 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{h.note}</span>
          </div>
        )}
      </button>
      {editing ? (
        <div className="mt-2 space-y-1.5">
          <textarea
            autoFocus
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="对这处高亮的评论…"
            className="litera-input w-full text-xs h-16 resize-none"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => save.mutate(draftNote)}
              disabled={save.isPending}
              className="litera-btn-primary text-[11px] px-2 py-0.5"
            >
              {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              保存
            </button>
            <button
              onClick={() => { setEditing(false); setDraftNote(h.note ?? ""); }}
              className="litera-btn text-[11px] px-2 py-0.5"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-1.5">
          <button
            onClick={() => { setEditing(true); setDraftNote(h.note ?? ""); }}
            className="text-[10px] text-litera-mute hover:text-litera-text"
            title={h.note ? "编辑评论" : "添加评论"}
          >
            💬 {h.note ? "编辑" : "评论"}
          </button>
          <button
            onClick={() => { if (confirm("删除这条高亮?")) onDelete(); }}
            className="text-[10px] text-litera-mute hover:text-red-400 ml-auto inline-flex items-center gap-0.5"
            title="删除高亮"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </li>
  );
}
