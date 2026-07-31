(() => {
  const mode = window.__LITFOLIO_STARTUP_NETWORK_MODE__;
  const internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== "function") return;

  const rawInvoke = internals.invoke.bind(internals);
  const pending = new Set();
  const controlBase = "http://203.0.113.1:9";

  const track = (promise) => {
    const tracked = Promise.resolve(promise).catch(() => undefined);
    pending.add(tracked);
    tracked.finally(() => pending.delete(tracked));
    return tracked;
  };

  const invokeAudit = (command, args) => track(rawInvoke(command, args));
  const record = (observer, phase, operation, destination, controlId) =>
    invokeAudit("startup_network_audit_record", {
      observer,
      phase,
      operation,
      destination,
      controlId,
    });

  const destinationOf = (input) => {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input && typeof input.url === "string" ? input.url : "<unknown>";
  };

  const isExternal = (destination) => {
    try {
      const url = new URL(destination, window.location.href);
      return ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
        !["tauri.localhost", "ipc.localhost", "asset.localhost"].includes(url.hostname);
    } catch {
      return false;
    }
  };

  const controlIdOf = (destination) => {
    try {
      return new URL(destination, window.location.href).searchParams.get("controlId");
    } catch {
      return null;
    }
  };

  const phaseForControl = (controlId) => {
    if ([
      "frontend-denied-fetch",
      "updater-denied-check",
      "webview-denied-navigation",
    ].includes(controlId)) return "cold-boot";
    if ([
      "frontend-denied-xml-http-request",
      "frontend-denied-web-socket",
      "frontend-denied-event-source",
      "webview-denied-image-request",
      "webview-denied-style-request",
      "webview-denied-media-request",
      "webview-denied-frame-request",
      "webview-csp-denied-attempt",
    ].includes(controlId)) return "readiness";
    return "idle";
  };

  const runtimePhase = () => {
    if (document.querySelector(".pdfViewer .page canvas")) return "idle";
    if (window.location.pathname.startsWith("/reader/")) return "readiness";
    return "cold-boot";
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const destination = destinationOf(input);
    if (isExternal(destination)) {
      const controlId = controlIdOf(destination);
      record(
        "frontend.fetch",
        controlId ? phaseForControl(controlId) : runtimePhase(),
        "fetch",
        destination,
        controlId
      );
    }
    return originalFetch(input, init);
  };

  const xhrDestinations = new WeakMap();
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    xhrDestinations.set(this, { method, destination: String(url) });
    return Reflect.apply(originalXhrOpen, this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const request = xhrDestinations.get(this);
    if (request && isExternal(request.destination)) {
      const controlId = controlIdOf(request.destination);
      record(
        "frontend.xml-http-request",
        controlId ? phaseForControl(controlId) : runtimePhase(),
        request.method,
        request.destination,
        controlId
      );
    }
    return Reflect.apply(originalXhrSend, this, [body]);
  };

  const OriginalWebSocket = window.WebSocket;
  function ObservedWebSocket(url, protocols) {
    const destination = String(url);
    if (isExternal(destination)) {
      const controlId = controlIdOf(destination);
      record(
        "frontend.web-socket",
        controlId ? phaseForControl(controlId) : runtimePhase(),
        "connect",
        destination,
        controlId
      );
    }
    return protocols === undefined
      ? new OriginalWebSocket(url)
      : new OriginalWebSocket(url, protocols);
  }
  Object.setPrototypeOf(ObservedWebSocket, OriginalWebSocket);
  ObservedWebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket = ObservedWebSocket;

  const OriginalEventSource = window.EventSource;
  function ObservedEventSource(url, options) {
    const destination = String(url);
    if (isExternal(destination)) {
      const controlId = controlIdOf(destination);
      record(
        "frontend.event-source",
        controlId ? phaseForControl(controlId) : runtimePhase(),
        "connect",
        destination,
        controlId
      );
    }
    return options === undefined
      ? new OriginalEventSource(url)
      : new OriginalEventSource(url, options);
  }
  Object.setPrototypeOf(ObservedEventSource, OriginalEventSource);
  ObservedEventSource.prototype = OriginalEventSource.prototype;
  window.EventSource = ObservedEventSource;

  if (typeof navigator.sendBeacon === "function") {
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      const destination = String(url);
      if (isExternal(destination)) {
        const controlId = controlIdOf(destination);
        record(
          "frontend.send-beacon",
          controlId ? phaseForControl(controlId) : runtimePhase(),
          "send",
          destination,
          controlId
        );
      }
      return originalSendBeacon(url, data);
    };
  }

  internals.invoke = (command, args, options) => {
    if (typeof command === "string" && command.startsWith("plugin:updater|")) {
      const controlId = "updater-denied-check";
      return record(
        "tauri.updater",
        "cold-boot",
        command,
        "https://github.com/lychen2/LitFolio/releases/latest/download/latest.json",
        controlId
      ).then(() => rawInvoke(command, args, options));
    }
    return rawInvoke(command, args, options);
  };

  document.addEventListener("securitypolicyviolation", (event) => {
    const destination = event.blockedURI || "csp:<redacted>";
    if (!isExternal(destination)) return;
    const controlId = controlIdOf(destination) || "webview-runtime-csp-denial";
    record(
      "webview.csp-denied-attempt",
      controlId === "webview-csp-denied-attempt" ? "readiness" : runtimePhase(),
      event.violatedDirective || "csp.block",
      destination,
      controlId
    );
  });

  try {
    localStorage.setItem("litfolio.lang", "en");
    localStorage.setItem("litera.onboarding.completed", "1");
  } catch {
    // The harness fails on missing readiness instead of relying on storage.
  }

  const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const waitFor = async (predicate, description, timeoutMs = 60000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (predicate()) return;
      await sleep(50);
    }
    throw new Error(
      `timed out waiting for ${description}; path=${window.location.pathname}; body=${(document.body?.textContent || "").slice(0, 500)}`
    );
  };

  const settleAuditCalls = async () => {
    for (let index = 0; index < 10 && pending.size > 0; index += 1) {
      await Promise.allSettled(Array.from(pending));
    }
  };

  const appendResourceControls = () => {
    const processControlUrl = (port, path, controlId) =>
      `http://203.0.113.1:${port}/${path}?controlId=${controlId}`;
    const observeProcessControl = (observer, phase, url, controlId) => {
      void record(observer, phase, "resource.load", url, controlId);
      return url;
    };

    const image = new Image();
    image.alt = "startup network image control";
    image.src = observeProcessControl(
      "webview.process-image-request",
      "readiness",
      processControlUrl(19001, "image.png", "webview-denied-image-request"),
      "webview-denied-image-request"
    );
    document.body.appendChild(image);

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = observeProcessControl(
      "webview.process-style-request",
      "readiness",
      processControlUrl(19002, "style.css", "webview-denied-style-request"),
      "webview-denied-style-request"
    );
    document.head.appendChild(style);

    const media = document.createElement("video");
    media.preload = "auto";
    media.src = observeProcessControl(
      "webview.process-media-request",
      "readiness",
      processControlUrl(19003, "media.mp4", "webview-denied-media-request"),
      "webview-denied-media-request"
    );
    document.body.appendChild(media);
    media.load();

    const frame = document.createElement("iframe");
    frame.src = observeProcessControl(
      "webview.process-frame-request",
      "readiness",
      processControlUrl(19004, "frame.html", "webview-denied-frame-request"),
      "webview-denied-frame-request"
    );
    document.body.appendChild(frame);

    const workerRequest = observeProcessControl(
      "webview.process-worker-request",
      "idle",
      processControlUrl(19005, "worker.js", "webview-denied-worker-request"),
      "webview-denied-worker-request"
    );
    const workerScript = `importScripts("${workerRequest}");`;
    const workerUrl = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
    let worker = null;
    try {
      worker = new Worker(workerUrl);
    } catch {
      URL.revokeObjectURL(workerUrl);
    }
    return () => {
      worker?.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  };

  const runPositiveControls = async () => {
    const fetchUrl = `${controlBase}/fetch?controlId=frontend-denied-fetch`;
    void window.fetch(fetchUrl).catch(() => undefined);

    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${controlBase}/xhr?controlId=frontend-denied-xml-http-request`);
    xhr.send();

    try {
      new WebSocket("ws://203.0.113.1:9/socket?controlId=frontend-denied-web-socket");
    } catch {
      // Observation occurs before the platform rejects the connection.
    }
    try {
      new EventSource(`${controlBase}/events?controlId=frontend-denied-event-source`);
    } catch {
      // Observation occurs before the platform rejects the connection.
    }
    navigator.sendBeacon(
      `${controlBase}/beacon?controlId=frontend-denied-send-beacon`,
      "startup-control"
    );

    await record(
      "tauri.updater",
      "cold-boot",
      "plugin:updater|check",
      "https://github.com/lychen2/LitFolio/releases/latest/download/latest.json",
      "updater-denied-check"
    );
    await rawInvoke("plugin:updater|check", {
      headers: null,
      timeout: 2000,
      proxy: null,
      target: null,
      allowDowngrades: false,
    }).catch(() => undefined);

    await rawInvoke("startup_network_audit_backend_control", {
      observer: "backend.api-client",
    });
    await rawInvoke("startup_network_audit_backend_control", {
      observer: "backend.external-client",
    });
    await rawInvoke("startup_network_audit_backend_control", {
      observer: "host.network-adapter",
    });
    await rawInvoke("startup_network_audit_backend_control", {
      observer: "scheduler.network-capable-timer",
    });

    const cleanupResources = appendResourceControls();

    const cspImage = new Image();
    cspImage.alt = "startup network CSP control";
    cspImage.src = "http://198.51.100.1:9/csp.png?controlId=webview-csp-denied-attempt";
    document.body.appendChild(cspImage);

    const navigation = document.createElement("a");
    navigation.href = "http://203.0.113.1:19006/navigation?controlId=webview-denied-navigation";
    navigation.target = "_self";
    navigation.hidden = true;
    document.body.appendChild(navigation);
    navigation.click();

    await sleep(3000);
    await settleAuditCalls();
    cleanupResources();
    await rawInvoke("startup_network_audit_finish_positive");
  };

  const runZeroScenario = async () => {
    await waitFor(
      () => document.body?.textContent?.includes("Startup Network Readiness Paper"),
      "Library readiness"
    );
    await rawInvoke("startup_network_audit_milestone", {
      milestone: "library-ready",
    });

    window.history.pushState({}, "", "/reader/startup-network-paper");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(
      () => {
        const canvas = document.querySelector(".pdfViewer .page canvas");
        return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
      },
      "Reader PDF readiness"
    );
    await rawInvoke("startup_network_audit_milestone", {
      milestone: "reader-pdf-ready",
    });
  };

  const start = async () => {
    await waitFor(
      () => document.body?.textContent?.includes("Library"),
      "application Library route"
    );
    if (mode === "positive-controls") {
      await runPositiveControls();
    } else {
      await runZeroScenario();
    }
  };

  if (window.location.protocol === "tauri:") {
    start().catch(async (error) => {
      await settleAuditCalls();
      await rawInvoke("startup_network_audit_fail", {
        message: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    });
  }
})();
