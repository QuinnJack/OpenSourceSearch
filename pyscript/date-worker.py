"""
PyScript worker that uses the htmldate package to discover publication dates.
Handles CORS-restricted pages by optionally routing through the configured proxy.
"""

from typing import Any, Dict, List

import micropip
from pyscript import fetch, window

DEFAULT_PROXY_ORIGINS = [
    "https://cors-anywhere.com/",
    "https://cors.isomorphic-git.org/",
    "https://r.jina.ai/",
]

_initialized = False
_find_date = None

__export__ = ["analyze_url"]


async def _ensure_dependencies() -> None:
    """Install and import htmldate exactly once."""
    global _initialized, _find_date
    if _initialized:
        return

    await micropip.install("htmldate")
    from htmldate import find_date  # type: ignore

    _find_date = find_date
    _initialized = True


def _candidate_urls(url: str) -> List[str]:
    """
    Try the direct URL first, then fall back to known HTTPS CORS proxies so we can
    fetch third-party pages from static hosting environments (e.g. GitHub Pages).
    """
    seen: set[str] = set()
    candidates: List[str] = []

    def add(target: str) -> None:
        if target and target not in seen:
            seen.add(target)
            candidates.append(target)

    proxy_hint = getattr(window, "__CORS_PROXY_ORIGIN", None)
    proxy_sources = [proxy_hint] if proxy_hint else []
    proxy_sources.extend(DEFAULT_PROXY_ORIGINS)

    for origin in proxy_sources:
        if not origin:
            continue
        add(f"{str(origin).rstrip('/')}/{url}")

    return candidates


async def _download_html(url: str) -> str:
    """Fetch the web page using the browser fetch API via PyScript."""
    errors: List[str] = []
    headers = {"Accept": "text/html"}

    for candidate in _candidate_urls(url):
        try:
            response = await fetch(candidate, headers=headers, mode="cors")
            if response.ok:
                return await response.text()
            errors.append(f"{response.status}: {response.statusText}")
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))

    reason = "; ".join(errors) or "Unknown error"
    raise RuntimeError(f"Unable to load {url}: {reason}")


def _format_date(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    return text or None


async def analyze_url(url: str) -> Dict[str, Any]:
    """
    Extract original and updated publication dates for the provided URL.

    Returning a serializable dict allows the main thread to forward the
    results back into the React app.
    """
    await _ensure_dependencies()

    cleaned_url = (url or "").strip()
    result: Dict[str, Any] = {"url": cleaned_url if cleaned_url else url}

    if not cleaned_url:
        result["error"] = "Missing URL"
        return result

    try:
        html = await _download_html(cleaned_url)
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        return result

    try:
        default_date = _find_date(html)  # type: ignore[misc]
        original_date = _find_date(html, original_date=True)  # type: ignore[misc]
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        return result

    result["lastUpdate"] = _format_date(default_date)
    result["originalDate"] = _format_date(original_date)
    return result
