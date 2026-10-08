"""Load local assessment settings from the ignored server/.env file."""
import os
from pathlib import Path
import uvicorn
p = Path(__file__).with_name('.env')
if p.exists():
    for line in p.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key.strip() in ('SPEECHSUPER_APP_KEY', 'SPEECHSUPER_SECRET_KEY', 'SPEECHACE_API_KEY', 'SPEECHACE_REGION', 'TENCENT_SOE_APP_ID', 'TENCENT_SOE_SECRET_ID', 'TENCENT_SOE_SECRET_KEY', 'TENCENT_SOE_SCORE_COEFF'):
            os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
if __name__ == '__main__':
    uvicorn.run('main:app', host='127.0.0.1', port=8000)
