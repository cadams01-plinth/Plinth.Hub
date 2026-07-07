# plinth-auth (Python)

Verify Plinth Launch Tokens in Python suite apps (SPEC §3).

```python
from plinth_auth import PltVerifier, PltError

verifier = PltVerifier(app_slug="bid-studio")  # aud must equal your slug

try:
    claims = verifier.verify(token_from_url_fragment)
    # establish YOUR OWN session from claims, then discard the PLT
except PltError as err:
    ...  # err.code is a SPEC §9 machine-readable code
```

Replay protection defaults to an in-process cache; supply a Redis-backed
`ReplayStore` when running multiple instances. Re-check entitlements against
`GET {hub}/api/licence/check?app={slug}` at most hourly and before privileged
actions.
