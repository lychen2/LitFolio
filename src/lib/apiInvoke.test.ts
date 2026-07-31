import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { invokeCommand } from "./apiInvoke";

describe("invokeCommand", () => {
  beforeEach(() => invoke.mockReset());

  it("invokes the command and parses the unknown response at the command path", async () => {
    invoke.mockResolvedValue({ count: 3 });
    const parse = vi.fn((value: unknown, path: string) => {
      expect(value).toEqual({ count: 3 });
      expect(path).toBe("papers_counted");
      return 3;
    });

    await expect(
      invokeCommand(
        { command: "papers_counted", parse },
        { folderId: 7 },
      ),
    ).resolves.toBe(3);
    expect(invoke).toHaveBeenCalledWith("papers_counted", { folderId: 7 });
    expect(parse).toHaveBeenCalledOnce();
  });

  it("does not hide parser failures", async () => {
    invoke.mockResolvedValue({ count: "invalid" });
    const error = new Error("papers_counted.count must be a number");

    await expect(
      invokeCommand(
        {
          command: "papers_counted",
          parse: () => {
            throw error;
          },
        },
        undefined,
      ),
    ).rejects.toBe(error);
  });
});
