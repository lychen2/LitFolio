"""Host the vendored reading service in the Android app's Python interpreter."""
from __future__ import annotations

import os
import socket
import threading
from concurrent.futures import Future
from contextlib import ExitStack
from http.server import ThreadingHTTPServer
from pathlib import Path


class _Server(ThreadingHTTPServer):
    # Join handlers after disconnecting HTTP keep-alive and WebSocket clients.
    daemon_threads = False

    def __init__(self, handler):
        self.stopping = threading.Event()
        self._connections: set[socket.socket] = set()
        self._connections_lock = threading.Lock()
        super().__init__(("127.0.0.1", 0), handler)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server_port}"

    def process_request(self, request, client_address):
        with self._connections_lock:
            self._connections.add(request)
        super().process_request(request, client_address)

    def shutdown_request(self, request):
        try:
            super().shutdown_request(request)
        finally:
            with self._connections_lock:
                self._connections.discard(request)

    def shutdown(self):
        self.stopping.set()
        super().shutdown()

    def server_close(self):
        with self._connections_lock:
            connections = tuple(self._connections)
        for connection in connections:
            try:
                connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        super().server_close()


_lock = threading.Lock()
_runtime: tuple[tuple[Path, Path], _Server, threading.Thread] | None = None


def _serve(home: Path, library: Path, ready: Future[_Server]) -> None:
    try:
        # Core reads its host mode during import, so configure the interpreter first.
        os.environ.update(LITFOLIO_CORE_HOME=str(home), LITFOLIO_CORE_LIBRARY=str(library),
                          LITFOLIO_CORE_HOST="litfolio", LITFOLIO_CORE_EMBEDDED="1")
        from core.app import config
        from core.app.log import log, setup
        from core.server.server import App, Handler

        class EmbeddedHandler(Handler):
            pass

        with ExitStack() as cleanup, _Server(EmbeddedHandler) as server:
            config.set_embedded_home(home)
            old_handlers = set(log.handlers)
            setup(config.LOG_PATH)
            for handler in log.handlers:
                if handler not in old_handlers:
                    cleanup.callback(handler.close)
                    cleanup.callback(log.removeHandler, handler)
            cleanup.callback(config.set_host_profile, None)

            app = App(config.load())
            cleanup.callback(app.location.marker.close)
            cleanup.callback(app.location.wait_idle)
            cleanup.callback(app.jobs.close)
            app.location.marker.start()
            app.shutdown = server.shutdown
            EmbeddedHandler.app = app

            ready.set_result(server)
            try:
                server.serve_forever(poll_interval=0.1)
            finally:
                server.stopping.set()
    except BaseException as error:
        if ready.done():
            raise
        ready.set_exception(error)


def start(home: str, library: str) -> str:
    """Start the service on an ephemeral loopback port and return its base URL."""
    global _runtime
    paths = Path(home).resolve(), Path(library).resolve()
    with _lock:
        if _runtime is not None:
            old_paths, server, thread = _runtime
            if thread.is_alive() and not server.stopping.is_set():
                if paths != old_paths:
                    raise RuntimeError("Stop the running reading service before changing its paths")
                return server.url
            thread.join()
            _runtime = None

        ready: Future[_Server] = Future()
        thread = threading.Thread(target=_serve, args=(*paths, ready), name="litfolio-core", daemon=True)
        thread.start()
        server = ready.result()
        _runtime = paths, server, thread
        return server.url


def stop() -> None:
    """Close the listener and wait for the service and its workers to stop."""
    global _runtime
    with _lock:
        if _runtime is None:
            return
        _, server, thread = _runtime
        if thread.is_alive() and not server.stopping.is_set():
            server.shutdown()
        thread.join()
        _runtime = None
