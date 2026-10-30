from functools import lru_cache
from pathlib import Path
import yaml


@lru_cache
def mission():
    return yaml.safe_load((Path(__file__).parent / 'content/compass/mission1.en.yaml').read_text(encoding='utf-8'))

