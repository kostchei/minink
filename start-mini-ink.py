from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import webbrowser


HOST = "127.0.0.1"
PORT = 4173
TOOL_DIRECTORY = Path(__file__).resolve().parent
URL = f"http://{HOST}:{PORT}"


def open_browser() -> None:
    webbrowser.open(URL)


def main() -> None:
    handler = partial(SimpleHTTPRequestHandler, directory=str(TOOL_DIRECTORY))
    try:
        server = ThreadingHTTPServer((HOST, PORT), handler)
    except OSError:
        print(f"Mini Ink could not start on {URL}.")
        print("If it is already running, opening the existing page now.")
        webbrowser.open(URL)
        input("Press Enter to close...")
        return

    Timer(0.5, open_browser).start()
    print(f"Mini Ink is running at {URL}")
    print("Close this window or press Ctrl+C to stop it.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
