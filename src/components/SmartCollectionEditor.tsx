import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import type { FilterRule, FilterRuleCondition } from "@/lib/api";
import { defaultCondition, defaultGroup, FIELDS, OPERATORS, READ_STATUS_OPTIONS, validateSmartCollectionRule } from "./smartCollectionRules";


export function SmartCollectionEditor({
  initialName,
  initialRules,
  onSave,
  onCancel,
}: {
  initialName?: string;
  initialRules?: FilterRule;
  onSave: (name: string, rules: FilterRule) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initialName ?? "");
  const [rules, setRules] = useState<FilterRule>(
    initialRules ?? defaultGroup(),
  );
  const ruleErrors = validateSmartCollectionRule(rules);
  const canSave = !!name.trim() && ruleErrors.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-litera-ink/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[90vw] max-h-[85vh] bg-litera-paper border border-litera-line rounded-xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-litera-line shrink-0">
          <span className="font-medium">
            {initialName ? t("smartCollections.edit") : t("smartCollections.create")}
          </span>
          <button onClick={onCancel} className="text-litera-mute hover:text-litera-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-litera-mute block mb-1">{t("smartCollections.name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="litera-input w-full"
              placeholder={t("smartCollections.name")}
            />
          </div>

          <div>
            <label className="text-xs text-litera-mute block mb-2">{t("smartCollections.rules")}</label>
            <RuleEditor rule={rules} onChange={setRules} depth={0} />
          </div>
          {ruleErrors.length > 0 && (
            <p className="mt-2 rounded-md border border-litera-error/30 bg-litera-error/10 px-3 py-2 text-xs text-litera-error" role="alert">
              {t(ruleErrors.includes("empty_group") ? "smartCollections.errorEmptyGroup" : "smartCollections.errorEmptyValue")}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-litera-line flex justify-end gap-2 shrink-0">
          <button onClick={onCancel} className="litera-btn text-xs">
            {t("smartCollections.cancel")}
          </button>
          <button
            onClick={() => {
              if (canSave) onSave(name.trim(), rules);
            }}
            disabled={!canSave}
            className="litera-btn-primary text-xs disabled:opacity-50"
          >
            {t("smartCollections.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  depth,
}: {
  rule: FilterRule;
  onChange: (r: FilterRule) => void;
  depth: number;
}) {
  const t = useT();

  if (rule.type === "condition") {
    return (
      <ConditionRow
        condition={rule}
        onChange={onChange}
        onRemove={() => {}}
        canRemove={false}
      />
    );
  }

  // Group
  return (
    <div className={`border border-litera-line rounded-lg p-3 space-y-2 ${depth > 0 ? "bg-litera-panel/30" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={rule.combinator}
          onChange={(e) =>
            onChange({ ...rule, combinator: e.target.value as "and" | "or" })
          }
          className="litera-input text-xs py-1 px-2 w-20"
        >
          <option value="and">{t("smartCollections.and")}</option>
          <option value="or">{t("smartCollections.or")}</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={() =>
            onChange({
              ...rule,
              rules: [...rule.rules, defaultCondition()],
            })
          }
          className="litera-btn text-xs py-1"
          title={t("smartCollections.addRule")}
        >
          <Plus className="h-3 w-3" /> {t("smartCollections.addRule")}
        </button>
        {depth < 2 && (
          <button
            onClick={() =>
              onChange({
                ...rule,
                rules: [...rule.rules, defaultGroup()],
              })
            }
            className="litera-btn text-xs py-1"
            title={t("smartCollections.addGroup")}
          >
            <Plus className="h-3 w-3" /> {t("smartCollections.addGroup")}
          </button>
        )}
      </div>

      {rule.rules.length === 0 && (
        <p className="text-xs text-litera-mute text-center py-2">
          {t("smartCollections.noRules")}
        </p>
      )}

      {rule.rules.map((child, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {child.type === "group" ? (
              <RuleEditor
                rule={child}
                onChange={(updated) => {
                  const next = [...rule.rules];
                  next[i] = updated;
                  onChange({ ...rule, rules: next });
                }}
                depth={depth + 1}
              />
            ) : (
              <ConditionRow
                condition={child}
                onChange={(updated) => {
                  const next = [...rule.rules];
                  next[i] = updated;
                  onChange({ ...rule, rules: next });
                }}
                onRemove={() => {
                  const next = rule.rules.filter((_, idx) => idx !== i);
                  onChange({ ...rule, rules: next });
                }}
                canRemove={rule.rules.length > 1}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: FilterRuleCondition;
  onChange: (c: FilterRule) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const t = useT();
  const ops = OPERATORS[condition.field] ?? OPERATORS.title;

  const valueInput = () => {
    if (condition.field === "read_status") {
      return (
        <select
          value={String(condition.value)}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          className="litera-input text-xs py-1 px-2 flex-1"
        >
          {READ_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      );
    }
    if (condition.field === "year") {
      return (
        <input
          type="number"
          value={Number(condition.value) || ""}
          onChange={(e) => onChange({ ...condition, value: Number(e.target.value) || 0 })}
          className="litera-input text-xs py-1 px-2 flex-1"
          placeholder="2024"
        />
      );
    }
    return (
      <input
        value={String(condition.value)}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        className="litera-input text-xs py-1 px-2 flex-1"
        placeholder="..."
      />
    );
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={condition.field}
        onChange={(e) => {
          const field = e.target.value;
          const newOps = OPERATORS[field] ?? OPERATORS.title;
          onChange({
            ...condition,
            field,
            operator: newOps[0].value,
            value: field === "year" ? 0 : field === "read_status" ? "unread" : "",
          });
        }}
        className="litera-input text-xs py-1 px-2 w-28"
      >
        {FIELDS.map((f) => (
          <option key={f.value} value={f.value}>{t(f.labelKey as any)}</option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className="litera-input text-xs py-1 px-2 w-28"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>{t(o.labelKey as any)}</option>
        ))}
      </select>
      <div className="flex-1">{valueInput()}</div>
      {canRemove && (
        <button onClick={onRemove} className="text-litera-mute hover:text-litera-error shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
