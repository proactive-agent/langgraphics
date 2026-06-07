import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from langgraphics.upstream import sync

SYNC_TIME_FILE = Path(__file__).parents[2] / "langgraphics" / "metadata" / ".sync_time"
FAKE_MODELS = json.dumps({"fake-model": {"reasoning": False, "tool_call": True}}).encode()


@pytest.fixture(autouse=True)
def clean_sync_time():
    if SYNC_TIME_FILE.exists():
        SYNC_TIME_FILE.unlink()
    yield
    if SYNC_TIME_FILE.exists():
        SYNC_TIME_FILE.unlink()


def test_sync_creates_sync_time_and_updates_models():
    assert not SYNC_TIME_FILE.exists()

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value.read.return_value = FAKE_MODELS
        sync()
        assert mock_urlopen.call_count == 1, (
            "sync() should fetch when last sync was more than a day ago"
        )

    assert SYNC_TIME_FILE.exists()

    recorded_time = float(SYNC_TIME_FILE.read_text().strip())
    assert abs(recorded_time - time.time()) < 5


def test_sync_skips_fetch_when_called_again_within_a_day():
    assert not SYNC_TIME_FILE.exists()

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value.read.return_value = FAKE_MODELS
        sync()
        assert mock_urlopen.call_count == 1, (
            "sync() should fetch when last sync was more than a day ago"
        )

    recorded_time = float(SYNC_TIME_FILE.read_text().strip())

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value.read.return_value = FAKE_MODELS
        sync()
        assert mock_urlopen.call_count == 0, (
            "sync() should skip when last sync was less than a day ago"
        )

    assert recorded_time == float(SYNC_TIME_FILE.read_text().strip())


def test_sync_refetches_after_a_day():
    stale_time = time.time() - (25 * 60 * 60)
    SYNC_TIME_FILE.write_text(str(stale_time))

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value.read.return_value = FAKE_MODELS
        sync()
        assert mock_urlopen.call_count == 1, (
            "sync() should fetch when last sync was more than a day ago"
        )

    new_time = float(SYNC_TIME_FILE.read_text().strip())
    assert new_time > stale_time
    assert abs(new_time - time.time()) < 5
