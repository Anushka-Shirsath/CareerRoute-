import subprocess
import os
import json
import io
import uuid
from unittest.mock import MagicMock
import pytest
from app.config import Settings
from app.errors import Problem
from app.scan_process import docker_command, scan_document


def test_production_rejects_unisolated_scanner():
    settings = Settings(_env_file=None, environment='production', cookie_secure=True,
                        share_token_pepper='x' * 32, database_url='postgresql://example',
                        public_api_origin='https://example.org', scanner_backend='process')
    with pytest.raises(ValueError, match='isolated Docker scanner'):
        settings.validate_production()
    settings.environment = 'staging'
    with pytest.raises(ValueError, match='isolated Docker scanner'):
        settings.validate_production()
    settings.environment = 'development'
    settings.demo_mode = False
    with pytest.raises(ValueError, match='isolated Docker scanner'):
        settings.validate_production()
    settings.environment = 'production'
    settings.demo_mode = True
    settings.scanner_backend = 'docker'
    settings.validate_production()


def test_docker_scanner_fails_closed_without_falling_back(monkeypatch):
    commands = []
    def no_docker(command, **kwargs):
        commands.append(command)
        raise FileNotFoundError('docker unavailable')
    monkeypatch.setattr(subprocess, 'Popen', no_docker)
    monkeypatch.setattr(subprocess, 'run', MagicMock())
    with pytest.raises(Problem) as error:
        scan_document(b'document', 'application/pdf', 'docker')
    assert error.value.status == 503
    assert len(commands) == 1 and commands[0][0] == 'docker'
    assert '--network' in commands[0] and 'none' in commands[0]
    assert '--read-only' in commands[0] and '--cap-drop' in commands[0]


@pytest.mark.skipif(not os.environ.get('CQ_TEST_SCANNER_IMAGE'), reason='Requires the built isolated scanner image')
def test_real_scanner_container_denies_network_and_host_files(tmp_path):
    image = os.environ['CQ_TEST_SCANNER_IMAGE']
    secret = tmp_path / 'host-only-test-file'
    secret.write_text('synthetic sentinel', encoding='utf-8')
    command = docker_command(image, 'cq-isolation-test-' + uuid.uuid4().hex, 'application/pdf')
    probe = '''import json,os,socket,sys
result={'uid':os.getuid(), 'host_file':os.path.exists(sys.argv[1])}
try:
    socket.create_connection(('1.1.1.1', 53), timeout=2)
    result['network']=True
except OSError:
    result['network']=False
try:
    open('/scanner/write-probe','w').write('x')
    result['root_write']=True
except OSError:
    result['root_write']=False
print(json.dumps(result))'''
    command = command[:-2] + ['--entrypoint', 'python', image, '-c', probe, str(secret)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=40, check=True)
    assert json.loads(result.stdout) == {'uid': 65534, 'host_file': False, 'network': False, 'root_write': False}


@pytest.mark.skipif(not os.environ.get('CQ_TEST_SCANNER_IMAGE'), reason='Requires the built isolated scanner image')
def test_real_scanner_container_extracts_an_image():
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new('RGB', (1800, 700), 'white')
    draw = ImageDraw.Draw(image)
    font_path = '/System/Library/Fonts/Supplemental/Arial.ttf' if os.path.exists('/System/Library/Fonts/Supplemental/Arial.ttf') else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    font = ImageFont.truetype(font_path, 65)
    draw.text((100, 100), 'Subject          Maximum   Obtained', font=font, fill='black')
    draw.text((100, 250), 'Mathematics      100       84', font=font, fill='black')
    content = io.BytesIO()
    image.save(content, format='PNG')
    rows, _ = scan_document(content.getvalue(), 'image/png', 'docker', os.environ['CQ_TEST_SCANNER_IMAGE'])
    assert rows[0]['obtained'] == 84
