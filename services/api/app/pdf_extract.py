import io
import base64
import json
import os
import re
import subprocess
import sys
from pathlib import Path
import pdfplumber
from PIL import Image, ImageOps, UnidentifiedImageError
from .errors import Problem
from .schemas import Subject

SUBJECTS = {'english': 'english', 'marathi': 'first_language', 'hindi': 'second_language', 'sanskrit': 'third_language', 'mathematics': 'mathematics', 'maths': 'mathematics', 'algebra': 'mathematics', 'geometry': 'mathematics', 'science': 'science', 'science and technology': 'science', 'science and technology part 1': 'science', 'science and technology part 2': 'science', 'social science': 'social_science', 'social sciences': 'social_science', 'history': 'social_science', 'geography': 'social_science', 'physics': 'science', 'chemistry': 'science', 'biology': 'science'}
SUBJECTS['science & technology'] = 'science'


def document_as_pdf(content, mime):
    if mime == 'application/pdf':
        return content
    expected = {'image/png': 'PNG', 'image/jpeg': 'JPEG'}.get(mime)
    if not expected:
        raise Problem('UPLOAD_REJECTED', 'Use a PDF, PNG, or JPEG image.')
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != expected or getattr(image, 'n_frames', 1) != 1 or image.width * image.height > 20_000_000:
                raise ValueError('Invalid image format or dimensions')
            image = ImageOps.exif_transpose(image)
            image.load()
            if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
                rgba = image.convert('RGBA')
                background = Image.new('RGB', rgba.size, 'white')
                background.paste(rgba, mask=rgba.getchannel('A'))
                image = background
            else:
                image = image.convert('RGB')
            output = io.BytesIO()
            image.save(output, format='PDF', resolution=120)
            return output.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise Problem('UPLOAD_REJECTED', 'The image could not be read. Use a clear PNG or JPEG under 20 megapixels.') from None


def _subject(name, obtained, maximum):
    name = ' '.join(str(name or '').split())
    canonical = SUBJECTS.get(name.casefold())
    if not canonical:
        return None
    try:
        return Subject(canonical_subject=canonical, name_as_shown=name, obtained=float(obtained), maximum=float(maximum), source='extracted').model_dump()
    except (ValueError, TypeError):
        return None


def _table_rows(table):
    """Read only explicitly labelled maximum and obtained columns."""
    result = []
    columns = None
    for row in table:
        cells = [' '.join((cell or '').casefold().split()) for cell in row]
        subject = next((i for i, c in enumerate(cells) if c in {'subject', 'subject name', 'subjects'}), None)
        maximum = next((i for i, c in enumerate(cells) if c in {'maximum', 'maximum marks', 'max marks', 'max. marks', 'max'}), None)
        obtained = next((i for i, c in enumerate(cells) if c in {'obtained', 'marks obtained', 'obtained marks', 'total obtained', 'total marks obtained'}), None)
        if subject is not None and maximum is not None and obtained is not None:
            columns = subject, obtained, maximum
            continue
        if columns and len(row) > max(columns):
            item = _subject(row[columns[0]], row[columns[1]], row[columns[2]])
            if item:
                result.append(item)
    return result


def _ssc_scan_rows(text):
    """Read SSC rows only when figures agree with the written-out marks."""
    lower = text.casefold()
    if 'subject code' not in lower or 'marks or grade obtained' not in lower:
        return []
    names = {'marathi': 'MARATHI', 'hindi': 'HINDI', 'english': 'ENGLISH',
             'mathematics': 'MATHEMATICS', 'science & technology': 'SCIENCE & TECHNOLOGY',
             'social sciences': 'SOCIAL SCIENCES'}
    numbers = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
               'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
               'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
               'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
               'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40,
               'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
               'hundred': 100, 'onehundred': 100}
    for tens in ('twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'):
        for unit in ('one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'):
            numbers[tens + unit] = numbers[tens] + numbers[unit]
    rows = []
    pattern = re.compile(r'^\s*(?:\d{1,3}\s+)?(marathi|hindi|english|mathematics|science\s*&\s*technology|social\s+sciences)\s*(?:\([^)]*\))?\s+(\d{1,3})\s+(\d{1,3})\s+([a-z ]+)\s*$', re.I)
    for line in text.splitlines():
        match = pattern.fullmatch(line)
        if not match:
            continue
        name, maximum, obtained, written = match.groups()
        written_value = numbers.get(re.sub(r'\s+', '', written).casefold())
        if written_value != int(obtained):
            continue
        key = ' '.join(name.casefold().split())
        canonical_name = names.get(key)
        if canonical_name:
            subject = _subject(canonical_name, obtained, maximum)
            if subject:
                rows.append(subject)
    return rows


def _scan_text(content):
    """Run OCR locally; document images never leave the API server."""
    lines = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                if not 0 < page.width <= 20000 or not 0 < page.height <= 20000:
                    raise ValueError('Invalid page dimensions')
                resolution = min(160, 3500 * 72 / max(page.width, page.height))
                image = page.to_image(resolution=resolution).original.convert('RGB')
                image.thumbnail((3500, 3500))
                buffer = io.BytesIO()
                image.save(buffer, format='PNG')
                if os.name != 'nt':
                    command = ['swift', str(Path(__file__).with_name('macos_ocr.swift'))] if sys.platform == 'darwin' else ['tesseract', 'stdin', 'stdout', '-l', 'eng', '--psm', '6']
                    result = subprocess.run(command, input=buffer.getvalue(), capture_output=True, timeout=60, check=True)
                    lines.append(result.stdout.decode('utf-8'))
                    continue
                result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-File', str(Path(__file__).with_name('windows_ocr.ps1'))], input=base64.b64encode(buffer.getvalue()), capture_output=True, timeout=60, check=True)
                words = json.loads(result.stdout.decode('utf-8-sig'))
                rows = []
                for word in sorted(words, key=lambda w: w['y'] + w['height'] / 2):
                    center = word['y'] + word['height'] / 2
                    row = next((r for r in rows if abs(r['center'] - center) <= max(r['height'], word['height']) * .6), None)
                    if row is None:
                        row = {'center': center, 'height': word['height'], 'words': []}
                        rows.append(row)
                    row['words'].append(word)
                lines.extend(' '.join(w['text'] for w in sorted(row['words'], key=lambda w: w['x'])) for row in rows)
    except (OSError, subprocess.SubprocessError, UnicodeError, ValueError, KeyError, TypeError):
        raise Problem('UPLOAD_REJECTED', 'Local scan reading failed. Check that the server has English OCR installed, or enter marks manually.') from None
    return '\n'.join(lines)


def extract_pdf(content, validate_only=False):
    if not content.startswith(b'%PDF-'):
        raise Problem('UPLOAD_REJECTED', 'Only a valid text PDF is supported.')
    subjects = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            if len(pdf.pages) > 3:
                raise Problem('UPLOAD_REJECTED', 'PDF must have at most 3 pages.')
            if validate_only:
                return [], []
            text = '\n'.join((page.extract_text() or '') for page in pdf.pages)
            if len(text) > 100000:
                raise Problem('UPLOAD_REJECTED', 'PDF contains too much text.')
            for page in pdf.pages:
                for table in page.extract_tables():
                    subjects.extend(_table_rows(table))
    except Problem:
        raise
    except Exception:
        raise Problem('UPLOAD_REJECTED', 'PDF could not be read. Use manual entry.') from None
    if not text.strip():
        text = _scan_text(content)
        scanned = True
        subjects.extend(_ssc_scan_rows(text))
    else:
        scanned = False
    # Only anchored, allowlisted subject rows with an unambiguous obtained/maximum
    # expression are accepted. Other uploaded text never enters prompts or storage.
    column_order = None
    for line in text.splitlines():
        header = line.casefold()
        if 'subject' in header and 'maximum' in header and 'obtained' in header:
            column_order = ('maximum', 'obtained') if header.index('maximum') < header.index('obtained') else ('obtained', 'maximum')
            continue
        match = re.fullmatch(r'\s*([A-Za-z][A-Za-z &0-9().-]{1,70}?)\s*:?\s+(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*', line)
        if not match and column_order:
            match = re.fullmatch(r'\s*([A-Za-z][A-Za-z &0-9().-]{1,70}?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*', line)
            if match:
                name, first, second = match.groups()
                values = dict(zip(column_order, (first, second)))
                item = _subject(name, values['obtained'], values['maximum'])
                if item:
                    subjects.append(item)
            continue
        if not match:
            continue
        name, obtained, maximum = match.groups()
        canonical = SUBJECTS.get(name.casefold())
        if canonical:
            try:
                item = _subject(name, obtained, maximum)
                if item:
                    subjects.append(item)
            except ValueError:
                continue
    # A table row may also appear in extracted text. Keep identical readings;
    # conflicting readings must be entered by the user instead of guessed.
    by_name = {}
    for item in subjects:
        key = item['name_as_shown'].casefold()
        if key in by_name and by_name[key] != item:
            raise Problem('UPLOAD_REJECTED', 'Conflicting subject marks found. Please enter them manually.')
        by_name[key] = item
    subjects = list(by_name.values())
    if not subjects:
        raise Problem('UPLOAD_REJECTED', 'No clearly labelled subject marks were found. Try a clear, upright scan or enter marks manually.')
    if len({s['name_as_shown'].casefold() for s in subjects}) != len(subjects):
        raise Problem('UPLOAD_REJECTED', 'Duplicate subject rows found. Use manual entry.')
    return subjects, ['Extraction is a draft. Check and confirm every subject.', 'Only clearly labelled subject marks were extracted. Enter any missing subjects manually.'] + (['Read locally from an image: OCR can make mistakes, so compare every value with the original.'] if scanned else [])
