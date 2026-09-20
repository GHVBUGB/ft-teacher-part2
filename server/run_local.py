"""Load only the two SpeechSuper settings from an ignored local .env."""
import os
from pathlib import Path
import uvicorn
p = Path(__file__).with_name('.env')
if p.exists():
    for line in p.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() in ('SPEECHSUPER_APP_KEY', 'SPEECHSUPER_SECRET_KEY', 'SPEECHACE_API_KEY', 'SPEECHACE_REGION'):
            os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
if __name__ == '__main__':
    uvicorn.run('main:app', host='127.0.0.1', port=8000)
