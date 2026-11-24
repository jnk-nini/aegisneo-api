"""Run the API and the website together on one address, for local work and the browser tests.

    python scripts/dev_server.py            # http://127.0.0.1:8000/frontend/

It needs the same settings as the API (DATABASE_URL, JWT_SECRET, AEGISNEO_API_KEYS, or a .env
file). The website is served with clean URLs (/hub, /auth, /explorer) and the same security
headers as the hub project (frontend/vercel.json), so a Content-Security-Policy mistake shows up here.
"""
import json
import os
import sys
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.index import app  # noqa: E402

SITE = ROOT / "frontend"
HEADERS = {h["key"]: h["value"] for h in json.loads((SITE / "vercel.json").read_text())["headers"][0]["headers"]}


class Site(StaticFiles):
    async def get_response(self, path, scope):
        last = path.rsplit("/", 1)[-1]
        if path and "." not in last and (SITE / f"{path}.html").exists():
            path = f"{path}.html"  # clean URLs, as on Vercel
        response = await super().get_response(path, scope)
        response.headers.update(HEADERS)
        return response


app.mount("/frontend", Site(directory=str(SITE), html=True), name="site")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
