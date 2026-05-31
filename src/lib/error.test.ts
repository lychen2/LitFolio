import { describe, expect, it } from "vitest";
import { errorMessage, errorMessageOr } from "./error";

describe("errorMessage", () => {
  it("prefers string and message values", () => {
    expect(errorMessage("plain failure")).toBe("plain failure");
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("uses string cause when message is absent", () => {
    expect(errorMessage({ cause: "root cause" })).toBe("root cause");
  });

  it("falls back when values have no useful message", () => {
    expect(errorMessage(null)).toBe("");
    expect(errorMessageOr({ message: "" }, "fallback")).toBe("fallback");
  });

  it("surfaces custom toString values", () => {
    expect(errorMessage({ toString: () => "custom" })).toBe("custom");
  });
});
