import hashlib

def hash_password(raw: str) -> str:
    return hashlib.sha256(("pepper-" + raw).encode()).hexdigest()

def check_password(raw: str, hashed: str) -> bool:
    return hash_password(raw) == hashed
