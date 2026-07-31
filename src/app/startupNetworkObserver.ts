export type StartupEgressKind =
  | "fetch"
  | "xhr"
  | "websocket"
  | "eventsource"
  | "beacon"
  | "timeout"
  | "interval";

export interface StartupEgressAttempt {
  kind: StartupEgressKind;
  destination?: string;
  delayMs?: number;
}

export interface StartupNetworkObserver {
  readonly attempts: StartupEgressAttempt[];
  uninstall(): void;
}

type ObservableWindow = Window & typeof globalThis;

function destinationOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Install before app import so module initialization cannot bypass observation. */
export function installStartupNetworkObserver(
  target: ObservableWindow = window,
): StartupNetworkObserver {
  const attempts: StartupEgressAttempt[] = [];
  const originalFetch = target.fetch;
  const OriginalXhr = target.XMLHttpRequest;
  const OriginalWebSocket = target.WebSocket;
  const OriginalEventSource = target.EventSource;
  const originalBeacon = target.navigator.sendBeacon?.bind(target.navigator);
  const originalSetTimeout = target.setTimeout;
  const originalSetInterval = target.setInterval;

  target.fetch = ((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    attempts.push({ kind: "fetch", destination: destinationOf(input) });
    return originalFetch.call(target, input, init);
  }) as typeof fetch;

  class ObservedXhr extends OriginalXhr {
    private observedDestination = "<unknown>";

    override open(method: string, url: string | URL, ...rest: unknown[]): void {
      this.observedDestination = String(url);
      Reflect.apply(super.open, this, [method, url, ...rest]);
    }

    override send(body?: Parameters<XMLHttpRequest["send"]>[0]): void {
      attempts.push({ kind: "xhr", destination: this.observedDestination });
      super.send(body);
    }
  }
  target.XMLHttpRequest = ObservedXhr;

  target.WebSocket = class ObservedWebSocket extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      attempts.push({ kind: "websocket", destination: String(url) });
      super(url, protocols);
    }
  };

  target.EventSource = class ObservedEventSource extends OriginalEventSource {
    constructor(
      url: string | URL,
      eventSourceInitDict?: ConstructorParameters<typeof EventSource>[1],
    ) {
      attempts.push({ kind: "eventsource", destination: String(url) });
      super(url, eventSourceInitDict);
    }
  };

  if (originalBeacon) {
    target.navigator.sendBeacon = ((
      url: string | URL,
      data?: Parameters<typeof navigator.sendBeacon>[1],
    ) => {
      attempts.push({ kind: "beacon", destination: String(url) });
      return originalBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  }

  target.setTimeout = ((
    handler: Parameters<typeof setTimeout>[0],
    timeout = 0,
    ...args: unknown[]
  ) => {
    attempts.push({ kind: "timeout", delayMs: timeout });
    return originalSetTimeout.call(target, handler, timeout, ...args);
  }) as typeof setTimeout;
  target.setInterval = ((
    handler: Parameters<typeof setInterval>[0],
    timeout = 0,
    ...args: unknown[]
  ) => {
    attempts.push({ kind: "interval", delayMs: timeout });
    return originalSetInterval.call(target, handler, timeout, ...args);
  }) as typeof setInterval;

  return {
    attempts,
    uninstall() {
      target.fetch = originalFetch;
      target.XMLHttpRequest = OriginalXhr;
      target.WebSocket = OriginalWebSocket;
      target.EventSource = OriginalEventSource;
      if (originalBeacon) target.navigator.sendBeacon = originalBeacon;
      target.setTimeout = originalSetTimeout;
      target.setInterval = originalSetInterval;
    },
  };
}
