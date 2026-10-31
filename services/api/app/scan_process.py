"""Run untrusted document parsing separately from the web process."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
from threading import BoundedSemaphore
import uuid
from .errors import Problem

_slots = BoundedSemaphore(2)


def docker_command(image, container_name, mime):
    return ['docker', 'run', '--rm', '-i', '--name', container_name,
            '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m,mode=1777',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--user', '65534:65534', '--pids-limit', '64', '--memory', '2g', '--cpus', '1',
            '--log-driver', 'none', '--pull', 'never', image, mime]


def scan_document(content, mime, backend='process', image='careerquest-scanner:local'):
    env = {name: os.environ[name] for name in ('PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR', 'DEVELOPER_DIR') if name in os.environ}
    env['PYTHONPATH'] = str(Path(__file__).resolve().parents[1])
    if not _slots.acquire(blocking=False):
        raise Problem('UPLOAD_REJECTED', 'The scanner is busy. Please try again shortly.', 503)
    container_name = None
    try:
        if backend == 'docker':
            container_name = 'careerquest-scan-' + uuid.uuid4().hex
            command = docker_command(image, container_name, mime)
        elif backend == 'process':
            command = [sys.executable, '-m', 'app.scan_worker', mime]
        else:
            raise ValueError('Unsupported scanner backend')
        process = subprocess.Popen(command, stdin=subprocess.PIPE,
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
        if backend == 'docker' and process.returncode == 125:
            raise Problem('SCANNER_UNAVAILABLE', 'The isolated scanner is temporarily unavailable. Please try again later.', 503)
        if process.returncode != 0 or len(stdout) > 1024 * 1024:
            raise ValueError('Oversized parser output')
        output = json.loads(stdout)
        if 'error' in output:
            error = output['error']
            raise Problem(error['code'], error['message'], error['status'])
        return output['subjects'], output['warnings']
    except Problem:
        raise
    except FileNotFoundError:
        if backend == 'docker':
            raise Problem('SCANNER_UNAVAILABLE', 'The isolated scanner is temporarily unavailable. Please try again later.', 503) from None
        raise Problem('UPLOAD_REJECTED', 'The file could not be scanned safely. Try a clear image or enter marks manually.') from None
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        raise Problem('UPLOAD_REJECTED', 'The file could not be scanned safely. Try a clear image or enter marks manually.') from None
    finally:
        if container_name:
            try:
                subprocess.run(['docker', 'rm', '-f', container_name], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=10, env=env, check=False)
            except (OSError, subprocess.SubprocessError):
                pass
        _slots.release()
