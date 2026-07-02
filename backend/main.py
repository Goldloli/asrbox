from __future__ import annotations

import argparse

import uvicorn

from backend import config
from backend.app import app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ASRbox backend server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=config.DEFAULT_PORT)
    args = parser.parse_args()
    uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=False)

