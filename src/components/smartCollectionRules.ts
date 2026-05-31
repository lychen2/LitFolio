import type { FilterRuleCondition, FilterRuleGroup } from "@/lib/api";

export const FIELDS = [
  { value: "title", labelKey: "smartCollections.fieldTitle" },
  { value: "year", labelKey: "smartCollections.fieldYear" },
  { value: "read_status", labelKey: "smartCollections.fieldReadStatus" },
  { value: "tags", labelKey: "smartCollections.fieldTags" },
  { value: "folders", labelKey: "smartCollections.fieldFolders" },
  { value: "venue", labelKey: "smartCollections.fieldVenue" },
] as const;

export const OPERATORS: Record<string, { value: string; labelKey: string }[]> = {
  title: [
    { value: "contains", labelKey: "smartCollections.opContains" },
    { value: "not_contains", labelKey: "smartCollections.opNotContains" },
  ],
  year: [
    { value: "gte", labelKey: "smartCollections.opGte" },
    { value: "lte", labelKey: "smartCollections.opLte" },
    { value: "gt", labelKey: "smartCollections.opGt" },
    { value: "lt", labelKey: "smartCollections.opLt" },
    { value: "equals", labelKey: "smartCollections.opEquals" },
  ],
  read_status: [{ value: "equals", labelKey: "smartCollections.opEquals" }],
  tags: [{ value: "equals", labelKey: "smartCollections.opEquals" }],
  folders: [{ value: "equals", labelKey: "smartCollections.opEquals" }],
  venue: [
    { value: "contains", labelKey: "smartCollections.opContains" },
    { value: "not_contains", labelKey: "smartCollections.opNotContains" },
  ],
};

export const READ_STATUS_OPTIONS = ["unread", "reading", "read", "must"];

export function defaultCondition(): FilterRuleCondition {
  return { type: "condition", field: "title", operator: "contains", value: "" };
}

export function defaultGroup(): FilterRuleGroup {
  return { type: "group", combinator: "and", rules: [defaultCondition()] };
}
