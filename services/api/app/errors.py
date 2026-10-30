class Problem(Exception):
    def __init__(self, code, message, status=422, fields=None):
        self.code, self.message, self.status, self.fields = code, message, status, fields or []
