"""Entry point for VAIO - opens the app in its own window, not a browser tab.

The app is a local FastAPI server rendering a plain HTML/CSS/JS frontend,
which historically meant "start a server, then point your browser at
localhost". That worked, but it never *felt* like an app: an address bar,
a tab strip, bookmarks, and a window that looks like every other tab you
have open.

So this runs the same server and then hands its URL to a native window
(pywebview), which on Windows is the WebView2 control that ships with
Edge, on macOS is WKWebView and on Linux is WebKitGTK. Same frontend,
same server, no browser chrome - and the taskbar entry is VAIO rather
than a browser.

The server runs on a background thread because pywebview must own the
main thread; every desktop UI toolkit it wraps requires that, and running
it anywhere else either fails outright or hangs. The thread is a daemon,
so closing the window ends the process and takes the server with it -
there is nothing left running in the background afterwards.

If no native window can be opened - a Linux box with no WebKitGTK, say -
this falls back to the browser rather than refusing to start. Losing the
window is a worse-looking app; refusing to launch is no app at all.
"""
from __future__ import annotations

import contextlib
import logging
import os
import socket
import sys
import threading
import time
import webbrowser


# ---------------------------------------------------------------------
# This has to run before uvicorn is imported, which is why it sits above
# the rest of the imports rather than in a function.
#
# A PyInstaller --windowed build has no console, and gives the program
# sys.stdout and sys.stderr of None. That is not merely inconvenient:
# uvicorn's Config constructor calls logging.config.dictConfig on a
# formatter that inspects sys.stdout to decide about colour, and raises
# "ValueError: Unable to configure formatter 'default'" before the server
# ever binds a port. The server thread then dies on the first line, the
# window opens onto nothing, and there is no console for the traceback to
# appear in - the app just sits there looking broken.
#
# Pointing the missing streams at the null device costs nothing and makes
# every library that assumes they exist behave normally.
def _repair_missing_std_streams() -> None:
    for name in ("stdout", "stderr"):
        if getattr(sys, name, None) is None:
            setattr(sys, name, open(os.devnull, "w", encoding="utf-8"))


_repair_missing_std_streams()

import uvicorn  # noqa: E402  - must come after the streams are repaired

from server import app  # noqa: E402

HOST = "127.0.0.1"
PREFERRED_PORT = 8501
WINDOW_TITLE = "VAIO"


def _log(message: str) -> None:
    """Says what happened, to wherever there is to say it.

    A windowed build has no console to read, so by default this goes to
    the null device and nobody sees it - which is fine until the app will
    not start and there is nothing to go on. Setting VAIO_DEBUG=1 also
    writes it to vaio-launch.log beside the executable, which is what the
    build workflow dumps when its smoke test fails, and what to ask for if
    the app ever refuses to open on someone's machine.
    """
    try:
        print(message, file=sys.stderr)
    except Exception:
        pass

    if os.environ.get("VAIO_DEBUG") != "1":
        return
    try:
        import app_paths
        log_path = app_paths.APP_ROOT / "vaio-launch.log"
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {message}\n")
    except Exception:
        pass

# Big enough that the Command Centre's two columns and the Projects table
# have room on a laptop screen, small enough to fit one. min_size stops
# the window being dragged below the width the layout is built for.
WINDOW_SIZE = (1440, 920)
WINDOW_MIN_SIZE = (1024, 680)


def _free_port() -> int:
    """8501 when it's free, any free port otherwise.

    Hard-coding one port means a second launch - or anything else already
    using 8501 - dies with "address already in use" before showing
    anything. The window is told whichever port was actually taken, so it
    does not care which one that is.
    """
    with contextlib.closing(socket.socket()) as probe:
        try:
            probe.bind((HOST, PREFERRED_PORT))
            return PREFERRED_PORT
        except OSError:
            pass
    with contextlib.closing(socket.socket()) as probe:
        probe.bind((HOST, 0))
        return int(probe.getsockname()[1])


class _ThreadedServer(uvicorn.Server):
    """uvicorn installs SIGINT/SIGTERM handlers on start, and Python only
    allows that from the main thread - which pywebview owns. The window
    closing is what ends this process, so there is nothing for these
    handlers to do anyway."""

    def install_signal_handlers(self) -> None:
        return


def _start_server(port: int) -> _ThreadedServer:
    server = _ThreadedServer(uvicorn.Config(app, host=HOST, port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()

    # Waited for rather than slept past: pointing the window at a server
    # that has not finished binding gives a "can't reach this page" pane
    # that never retries, which looks like a broken app.
    deadline = time.monotonic() + 20
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    return server


def _open_window(url: str) -> bool:
    """True if a native window was shown and has since been closed."""
    try:
        import webview
    except ImportError:
        return False

    # Silenced *after* the import, not before: pywebview configures this
    # logger while it loads, which overrides anything set earlier. It logs
    # a full traceback of its own when a backend will not load, before
    # this code ever sees the failure - a wall of red for a situation
    # already handled. The one-line message below says what happened, and
    # the app still opens.
    logging.getLogger("pywebview").setLevel(logging.CRITICAL)

    # A link to somewhere else on the internet - a note's link, a Wise
    # payment page - belongs in the real browser. Without this it would
    # navigate the app window itself, leaving the user inside VAIO's
    # window looking at a website with no way back.
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    # The app's own downloads (a project doc, an exported invoice) are
    # same-origin, so they are not "external" and need this instead.
    webview.settings["ALLOW_DOWNLOADS"] = True

    try:
        webview.create_window(
            WINDOW_TITLE, url,
            width=WINDOW_SIZE[0], height=WINDOW_SIZE[1],
            min_size=WINDOW_MIN_SIZE,
            text_select=True,
        )
        webview.start()
        return True
    except Exception as exc:  # no GUI toolkit, no display, no WebView2
        _log(f"Could not open an app window ({exc}); using the browser instead.")
        return False


def _open_browser(url: str) -> None:
    """The last resort must not be able to crash the app.

    webbrowser.open() raises rather than returning False on a machine with
    no browser it can drive - a bare server, a locked-down desktop - and
    this is already the fallback path. Failing here would take down an app
    that is otherwise running perfectly well and reachable at the URL
    printed below.
    """
    try:
        webbrowser.open(url)
    except Exception as exc:
        _log(f"Could not open a browser either ({exc}).")
    _log(f"VAIO is running at {url} - open that address to use it.")


def main() -> None:
    port = _free_port()
    server = _start_server(port)
    url = f"http://{HOST}:{port}"
    _log(f"server started={server.started} url={url} frozen={getattr(sys, 'frozen', False)}")

    # An escape hatch for working on the app itself, where a browser's
    # devtools are worth more than the window.
    if os.environ.get("VAIO_BROWSER") == "1":
        _open_browser(url)
        _serve_until_interrupted(server)
        return

    if not _open_window(url):
        _open_browser(url)
        _serve_until_interrupted(server)


def _serve_until_interrupted(server: _ThreadedServer) -> None:
    """Without a window to close, something has to hold the process open."""
    try:
        while server.started:
            time.sleep(0.25)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
