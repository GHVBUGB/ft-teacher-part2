"""Secret material stays server-side. No fallback passwords or demo sessions."""
import base64
import hashlib
import hmac
import secrets


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def password_hash(password: str) -> str:
    if not 10 <= len(password) <= 128:
        raise ValueError('Password must have 10–128 characters')
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return 'scrypt$16384$8$1$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()


def password_matches(password: str, stored: str | None) -> bool:
    if not stored or len(password) > 128:
        return False
    try:
        algorithm, n, r, p, salt, expected = stored.split('$')
        if (algorithm, n, r, p) != ('scrypt', '16384', '8', '1'):
            return False
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt, validate=True), n=16384, r=8, p=1)
        return hmac.compare_digest(actual, base64.b64decode(expected, validate=True))
    except (ValueError, TypeError):
        return False


def otp_digest(secret: str, challenge_id: str, code: str) -> str:
    return hmac.new(secret.encode(), f'{challenge_id}:{code}'.encode(), hashlib.sha256).hexdigest()
