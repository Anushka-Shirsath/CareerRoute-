"""One-shot document parser. The parent passes only document bytes on stdin."""
import json
import sys


def main():
    if sys.platform != 'win32':
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        if sys.platform.startswith('linux'):
            resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024, 1536 * 1024 * 1024))
    from .errors import Problem
    from .pdf_extract import document_as_pdf, extract_pdf
    try:
        content = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
        if len(content) > 5 * 1024 * 1024:
            raise Problem('UPLOAD_REJECTED', 'The document is too large.', 413)
        subjects, warnings = extract_pdf(document_as_pdf(content, sys.argv[1]))
        result = {'subjects': subjects, 'warnings': warnings}
    except Problem as error:
        result = {'error': {'code': error.code, 'message': error.message, 'status': error.status}}
    sys.stdout.write(json.dumps(result))


if __name__ == '__main__':
    main()
