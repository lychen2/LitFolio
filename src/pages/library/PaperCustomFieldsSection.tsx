import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function CustomFieldsSection({ paperId }: { paperId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: defs = [] } = useQuery({
    queryKey: ["custom-field-defs"],
    queryFn: api.customFieldDefsList,
  });
  const { data: fields = [] } = useQuery({
    queryKey: ["paper-custom-fields", paperId],
    queryFn: () => api.paperCustomFieldsGet(paperId),
  });

  const setMut = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: number; value: string }) =>
      api.paperCustomFieldSet(paperId, fieldId, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper-custom-fields", paperId] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (fieldId: number) => api.paperCustomFieldDelete(paperId, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-custom-fields", paperId] }),
  });

  if (defs.length === 0) return null;

  const fieldMap = new Map(fields.map((field) => [field.field_id, field]));

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("customFields.title")}</h3>
      <dl className="space-y-2">
        {defs.map((def) => {
          const existing = fieldMap.get(def.id);
          const isEditing = editingId === def.id;
          return (
            <div key={def.id} className="flex items-center gap-2 text-sm">
              <dt className="text-litera-mute w-28 shrink-0">{def.name}</dt>
              <dd className="flex-1 min-w-0">
                {isEditing ? (
                  <FieldEditor
                    def={def}
                    value={editValue}
                    saving={setMut.isPending}
                    onCancel={() => setEditingId(null)}
                    onChange={setEditValue}
                    onSave={() => setMut.mutate({ fieldId: def.id, value: editValue })}
                  />
                ) : (
                  <FieldValue
                    value={existing?.value}
                    onEdit={() => {
                      setEditingId(def.id);
                      setEditValue(existing?.value ?? "");
                    }}
                  />
                )}
              </dd>
              {existing && !isEditing && (
                <button
                  onClick={() => deleteMut.mutate(def.id)}
                  className="text-litera-mute hover:text-red-400 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function FieldEditor({
  def,
  value,
  saving,
  onCancel,
  onChange,
  onSave,
}: {
  def: Awaited<ReturnType<typeof api.customFieldDefsList>>[number];
  value: string;
  saving: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      <FieldInput def={def} value={value} onChange={onChange} />
      <button
        onClick={onSave}
        disabled={saving}
        className="litera-btn-primary text-[10px] px-2 py-0.5"
      >
        {t("common.save")}
      </button>
      <button onClick={onCancel} className="text-litera-mute text-[10px]">✕</button>
    </div>
  );
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: Awaited<ReturnType<typeof api.customFieldDefsList>>[number];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  if (def.field_type === "select" && def.options) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="litera-input text-xs py-0.5 flex-1">
        <option value="">{t("paper.detail.emptyValue")}</option>
        {def.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  const type = def.field_type === "date" || def.field_type === "number" ? def.field_type : undefined;
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="litera-input text-xs py-0.5 flex-1"
    />
  );
}

function FieldValue({ value, onEdit }: { value?: string; onEdit: () => void }) {
  return (
    <span className="cursor-pointer hover:text-litera-accent" onClick={onEdit}>
      {value || <span className="text-litera-mute italic">--</span>}
    </span>
  );
}
