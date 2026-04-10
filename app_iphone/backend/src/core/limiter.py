from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiter global — usado nos endpoints de autenticação (OWASP A07: proteção contra brute force)
limiter = Limiter(key_func=get_remote_address)
