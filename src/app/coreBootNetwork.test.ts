import { afterEach, describe, expect, it, vi } from "vitest";
import { installStartupNetworkObserver } from "./startupNetworkObserver";

function observableWindow(): Window & typeof globalThis {
  class FakeXhr {
    open(): void {}
    send(): void {}
  }
  class FakeWebSocket {
    constructor(_url: string | URL, _protocols?: string | string[]) {}
  }
  class FakeEventSource {
    constructor(
      _url: string | URL,
      _options?: ConstructorParameters<typeof EventSource>[1],
    ) {}
  }

  return {
    fetch: vi.fn(async () => new Response()),
    XMLHttpRequest: FakeXhr,
    WebSocket: FakeWebSocket,
    EventSource: FakeEventSource,
    navigator: { sendBeacon: vi.fn(() => true) },
    setTimeout,
    setInterval,
  } as unknown as Window & typeof globalThis;
}

describe("startup network observer", () => {
  afterEach(() => vi.useRealTimers());

  it("observes real frontend transport calls before dispatch", async () => {
    const target = observableWindow();
    const observer = installStartupNetworkObserver(target);

    await target.fetch("https://network.invalid/fetch-control");
    const xhr = new target.XMLHttpRequest();
    xhr.open("GET", "https://network.invalid/xhr-control");
    xhr.send();
    new target.WebSocket("wss://network.invalid/websocket-control");
    new target.EventSource("https://network.invalid/eventsource-control");
    target.navigator.sendBeacon("https://network.invalid/beacon-control");

    expect(observer.attempts.map(({ kind }) => kind)).toEqual([
      "fetch",
      "xhr",
      "websocket",
      "eventsource",
      "beacon",
    ]);
    observer.uninstall();
  });

  it("observes timer registration during a 30-second fake idle window", async () => {
    vi.useFakeTimers();
    const target = observableWindow();
    target.setTimeout = setTimeout;
    target.setInterval = setInterval;
    const observer = installStartupNetworkObserver(target);

    target.setTimeout(() => undefined, 30_000);
    target.setInterval(() => undefined, 6 * 60 * 60 * 1_000);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(observer.attempts).toEqual([
      { kind: "timeout", delayMs: 30_000 },
      { kind: "interval", delayMs: 21_600_000 },
    ]);
    observer.uninstall();
  });
});
