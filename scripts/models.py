import json
import pathlib

import requests

url = "https://models.dev/api.json"
data = requests.get(url, headers={"user-agent": "LangGraphics"}).json()

models = {}
for provider in data.values():
    for metadata in provider.get("models", {}).values():
        models[metadata["id"].lower()] = {
            "reasoning": metadata.get("reasoning", False),
            "tool_call": metadata.get("tool_call", False),
            "attachment": metadata.get("attachment", False),
            "temperature": metadata.get("temperature", False),
            "limit": {
                "output": 0,
                "context": 0,
                **metadata.get("limit", {}),
            },
            "cost": {
                "input": 0,
                "output": 0,
                "cache_read": 0,
                "cache_write": 0,
                **metadata.get("cost", {}),
            },
        }

rootdir_path = pathlib.Path(__file__).parent.parent
datadir_path = rootdir_path / "langgraphics" / "metadata"

with open(datadir_path / "models.json", "w", encoding="utf-8") as fp:
    json.dump(models, fp, ensure_ascii=False, indent=2)
