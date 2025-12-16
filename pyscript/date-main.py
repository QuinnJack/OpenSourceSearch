"""
Bridge between the React app and the PyScript-based htmldate worker.

Listens for DOM CustomEvents dispatched from the UI, forwards the work to
the background worker, and emits events with the parsed publication dates.
"""

import asyncio
from typing import Any, Dict, List, Tuple

from pyscript import workers
from pyscript.ffi import create_proxy
from js import window, CustomEvent  # type: ignore


_REQUEST_EVENT = "htmldate:request"
_RESPONSE_EVENT = "htmldate:response"
_BRIDGE_READY_EVENT = "htmldate:bridge-ready"
_WORKER_READY_EVENT = "htmldate:worker-ready"
_READY_FLAG = "__htmldateBridgeReady"

pending_requests: List[Tuple[str, str]] = []
worker = None


def _emit(name: str, detail: Dict[str, Any] | None = None) -> None:
    """Dispatch a CustomEvent on window with optional detail payload."""
    if detail is None:
        detail = {}
    event = CustomEvent.new(name, {"detail": detail})
    window.dispatchEvent(event)


async def _run_request(request_id: str, url: str) -> None:
    """Invoke the worker and forward the result to the UI."""
    global worker
    if not worker:
        pending_requests.append((request_id, url))
        return

    try:
        raw_result = await worker.analyze_url(url)
        if hasattr(raw_result, "to_py"):
            result = raw_result.to_py()
        elif isinstance(raw_result, dict):
            result = dict(raw_result)
        else:
            result = {"url": url}
    except Exception as exc:  # noqa: BLE001
        result = {"error": str(exc), "url": url}

    result["id"] = request_id
    _emit(_RESPONSE_EVENT, result)


async def _flush_pending() -> None:
    """Flush any queued requests once the worker becomes available."""
    while pending_requests:
        req_id, url = pending_requests.pop(0)
        asyncio.create_task(_run_request(req_id, url))


async def _bootstrap_worker() -> None:
    """Wait for the named worker defined in index.html to become ready."""
    global worker
    worker = await workers["htmldate-worker"]
    _emit(_WORKER_READY_EVENT, {"ready": True})
    await _flush_pending()


def _handle_request(event: Any) -> None:
    """Convert the CustomEvent payload and schedule the lookup."""
    data = getattr(event, "detail", None)
    if hasattr(data, "to_py"):
        data = data.to_py()
    payload = data or {}

    request_id = str(payload.get("id") or "").strip()
    url = str(payload.get("url") or "").strip()

    if not request_id or not url:
        return

    asyncio.create_task(_run_request(request_id, url))


def _signal_bridge_ready() -> None:
    """Notify the frontend that the PyScript bridge is ready for requests."""
    setattr(window, _READY_FLAG, True)
    _emit(_BRIDGE_READY_EVENT, {"ready": True})


request_listener = create_proxy(_handle_request)
window.addEventListener(_REQUEST_EVENT, request_listener)

asyncio.create_task(_bootstrap_worker())
_signal_bridge_ready()
