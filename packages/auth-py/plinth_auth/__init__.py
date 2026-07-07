"""plinth-auth — Plinth Launch Token (PLT) verification for Python suite apps.

Contract (SPEC §3): JWS RS256 verified offline against the Hub's JWKS at
/.well-known/plinth-sso.json. Apps MUST check iss, aud (their own slug), exp,
and reject a jti already seen within the token lifetime (10-minute replay
cache). The PLT is authentication, not a data-access token.
"""

from .verify import (
    DEFAULT_ISSUER,
    PLT_VERSION,
    REPLAY_WINDOW_SECONDS,
    InMemoryReplayStore,
    PltError,
    PltVerifier,
)

__all__ = [
    "DEFAULT_ISSUER",
    "PLT_VERSION",
    "REPLAY_WINDOW_SECONDS",
    "InMemoryReplayStore",
    "PltError",
    "PltVerifier",
]
