"""Same-origin deployment entrypoint for the authenticated frontend and API."""
import os
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse
from .app import app

static_root = Path(os.getenv('FT_STATIC_DIRECTORY', Path(__file__).resolve().parents[2]/'dist-production')).resolve()

@app.get('/{path:path}', include_in_schema=False)
def frontend(path: str):
    if path == 'api' or path.startswith('api/'):
        raise HTTPException(404,'NOT_FOUND')
    target = (static_root / path).resolve()
    if not target.is_relative_to(static_root):
        raise HTTPException(404,'NOT_FOUND')
    if target.is_file():
        return FileResponse(target)
    if path == '' or path == 'login' or path.startswith('training/'):
        index = static_root/'index.html'
        if index.is_file():
            return FileResponse(index)
    raise HTTPException(404,'NOT_FOUND')
