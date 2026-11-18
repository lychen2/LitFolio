import { describe, expect, it } from "vitest";

import { notifyLibraryChanged, subscribeLibraryChanged } from "./libraryRefresh";

describe("libraryRefresh", () => {
  it("notifies every subscriber and stops after unsubscribe", () => {
    let first = 0;
    let second = 0;
    const offFirst = subscribeLibraryChanged(() => {
      first += 1;
    });
    const offSecond = subscribeLibraryChanged(() => {
      second += 1;
    });

    notifyLibraryChanged();
    expect({ first, second }).toEqual({ first: 1, second: 1 });

    offFirst();
    notifyLibraryChanged();
    expect({ first, second }).toEqual({ first: 1, second: 2 });
    offSecond();
  });
});
