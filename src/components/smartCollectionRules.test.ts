import { describe, expect, it } from "vitest";

import { defaultCondition, defaultGroup, OPERATORS, READ_STATUS_OPTIONS } from "./smartCollectionRules";

describe("smart collection rule helpers", () => {
  it("creates independent default groups", () => {
    const first = defaultGroup();
    const second = defaultGroup();

    const firstRule = first.rules[0];
    const secondRule = second.rules[0];
    if (firstRule.type !== "condition" || secondRule.type !== "condition") {
      throw new Error("default group must contain conditions");
    }
    firstRule.value = "transformer";

    expect(secondRule.value).toBe("");
    expect(first).not.toBe(second);
  });

  it("keeps field-specific operators explicit", () => {
    expect(OPERATORS.year.map((operator) => operator.value)).toEqual([
      "gte",
      "lte",
      "gt",
      "lt",
      "equals",
    ]);
    expect(READ_STATUS_OPTIONS).toContain("must");
  });

  it("uses a title contains condition by default", () => {
    expect(defaultCondition()).toEqual({
      type: "condition",
      field: "title",
      operator: "contains",
      value: "",
    });
  });
});
