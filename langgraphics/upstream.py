import json
import time
import urllib.request
from pathlib import Path


def sync() -> None:
    now = time.time()
    metadata_dir = Path(__file__).parent / "metadata"
    sync_time = metadata_dir / ".sync_time"
    if sync_time.exists():
        try:
            last = float(sync_time.read_text().strip())
            if now - last < 24 * 60 * 60:
                return
        except (ValueError, OSError):
            pass

    try:
        with urllib.request.urlopen((
                "https://raw.githubusercontent.com/"
                "proactive-agent/langgraphics/main/"
                "langgraphics/metadata/models.json"
        ), timeout=5) as models:
            data = models.read()
        json.loads(data)
        (metadata_dir / "models.json").write_bytes(data)
        sync_time.write_text(str(now))
    except (TypeError, Exception):
        pass
