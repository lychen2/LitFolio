import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "./tauriCoreMock";

afterEach(() => vi.unstubAllGlobals());

it("handles revealing the library directory through the opener SDK in browser tests", async () => {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
  await expect(revealItemInDir("/library/Papers")).resolves.toBeUndefined();
});
