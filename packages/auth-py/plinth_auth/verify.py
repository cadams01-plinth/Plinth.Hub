from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import jwt
from jwt import PyJWKClient

PLT_VERSION = 1
DEFAULT_ISSUER = "https://hub.plinthresource.com"
REPLAY_WINDOW_SECONDS = 10 * 60  # 10-minute token lifetime

_REQUIRED_CLAIMS = ("sub", "org", "org_name", "name", "email", "role", "jti")


class PltError(Exception):
    """Raised on any PLT verification failure with a SPEC §9 code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class ReplayStore(Protocol):
    def seen(self, jti: str, expires_at: float) -> bool:
        """Return True if jti was already present; otherwise record it."""
        ...


@dataclass
class InMemoryReplayStore:
    """Single-process replay cache. Use Redis in multi-instance apps."""

    _entries: dict[str, float] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def seen(self, jti: str, expires_at: float) -> bool:
        now = time.time()
        with self._lock:
            for key in [k for k, exp in self._entries.items() if exp <= now]:
                del self._entries[key]
            if jti in self._entries:
                return True
            self._entries[jti] = expires_at
            return False


class PltVerifier:
    """Verify Plinth Launch Tokens against the Hub's JWKS.

    Usage:
        verifier = PltVerifier(app_slug="bid-studio")
        claims = verifier.verify(token)
    """

    def __init__(
        self,
        app_slug: str,
        jwks_url: str | None = None,
        issuer: str = DEFAULT_ISSUER,
        replay_store: ReplayStore | None = None,
    ) -> None:
        self.app_slug = app_slug
        self.issuer = issuer
        self.replay_store = replay_store or InMemoryReplayStore()
        # JWKS served with cache-control 1 h; PyJWKClient caches keys itself.
        self._jwk_client = PyJWKClient(
            jwks_url or f"{issuer}/.well-known/plinth-sso.json",
            cache_keys=True,
            lifespan=3600,
        )

    def verify(self, token: str) -> dict[str, Any]:
        try:
            signing_key = self._jwk_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self.app_slug,
                issuer=self.issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub", "jti"]},
            )
        except jwt.ExpiredSignatureError as err:
            raise PltError("PLINTH_TOKEN_EXPIRED", "Launch token has expired") from err
        except jwt.PyJWTError as err:
            raise PltError("PLINTH_FORBIDDEN", f"Launch token rejected: {err}") from err

        if claims.get("ver") != PLT_VERSION:
            raise PltError("PLINTH_VALIDATION", f"Unsupported PLT version {claims.get('ver')}")
        for name in _REQUIRED_CLAIMS:
            if not claims.get(name):
                raise PltError("PLINTH_VALIDATION", f"PLT missing required claim: {name}")
        if not isinstance(claims.get("entitlements"), list):
            raise PltError("PLINTH_VALIDATION", "PLT missing entitlements claim")

        expires_at = float(claims["exp"]) + REPLAY_WINDOW_SECONDS
        if self.replay_store.seen(claims["jti"], expires_at):
            raise PltError("PLINTH_TOKEN_REPLAY", "Launch token already used")
        return claims
