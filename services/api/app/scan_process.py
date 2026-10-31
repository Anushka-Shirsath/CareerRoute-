"""Run untrusted document parsing separately from the web process."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
from threading import BoundedSemaphore
from .errors import Problem

_slots = BoundedSemaphore(2)


def scan_document(content, mime):
    env = {name: os.environ[name] for name in ('PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR', 'DEVELOPER_DIR') if name in os.environ}
    env['PYTHONPATH'] = str(Path(__file__).resolve().parents[1])
    if not _slots.acquire(blocking=False):
        raise Problem('UPLOAD_REJECTED', 'The scanner is busy. Please try again shortly.', 503)
    try:
        process = subprocess.Popen([sys.executable, '-m', 'app.scan_worker', mime], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env,
                                   start_new_session=os.name != 'nt')
        try:
            stdout, _ = process.communicate(content, timeout=90)
        except subprocess.TimeoutExpired:
            if os.name != 'nt':
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.communicate()
            raise
        if process.returncode != 0 or len(stdout) > 1024 * 1024:
            raise ValueError('Oversized parser output')
        output = json.loads(stdout)
        if 'error' in output:
            error = output['error']
            raise Problem(error['code'], error['message'], error['status'])
        return output['subjects'], output['warnings']
    except Problem:
        raise
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        raise Problem('UPLOAD_REJECTED', 'The file could not be scanned safely. Try a clear image or enter marks manually.') from None
    finally:
        _slots.release()
