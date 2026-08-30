"""Autenticação: hashing de senha, JWT e dependências FastAPI."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from . import models
from .database import get_db


SEED_ADMIN_EMAIL = "marceloghilario@gmail.com"

# Apps disponíveis no portal — usados também pelo campo permissions.
APP_KEYS = ("financial",)


def user_apps(role: str | None, permissions: list[str] | None) -> list[str]:
    """Lista de apps que o usuário pode acessar.

    Regras:
    - admin: sempre todos os apps
    - permissions = None (legado): também todos os apps (compat com contas antigas)
    - permissions = lista: apenas os apps presentes
    """
    if role == "admin":
        return list(APP_KEYS)
    if permissions is None:
        return list(APP_KEYS)
    return [a for a in APP_KEYS if a in permissions]


JWT_SECRET = os.environ.get("AUTH_SECRET_KEY") or "dev-secret-please-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 30  # 30 dias

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()


def _truncate_for_bcrypt(password: str) -> bytes:
    # bcrypt limita a 72 bytes; truncamos manualmente para evitar erro.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    pw = _truncate_for_bcrypt(password)
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(_truncate_for_bcrypt(password), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(None, 1)[1].strip() or None
    return None


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> models.User:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Sessão inválida.")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Sessão inválida.") from None
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso pendente ou revogado.",
        )
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
    return user


def is_seed_admin(email: str) -> bool:
    return (email or "").strip().lower() == SEED_ADMIN_EMAIL


def verify_google_id_token(id_token_str: str) -> dict[str, Any]:
    """Valida o ID token do Google e retorna o payload (email, sub, name)."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Login com Google não está configurado neste servidor.",
        )
    try:
        from google.auth.transport import requests as g_requests
        from google.oauth2 import id_token as g_id_token
    except ImportError as e:
        raise HTTPException(status_code=500, detail="google-auth indisponível.") from e

    try:
        info = g_id_token.verify_oauth2_token(
            id_token_str, g_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Token Google inválido: {e}") from e

    email = info.get("email")
    sub = info.get("sub")
    if not email or not sub:
        raise HTTPException(status_code=401, detail="Token Google sem e-mail/sub.")
    if not info.get("email_verified", False):
        raise HTTPException(status_code=401, detail="E-mail Google não verificado.")
    return info
