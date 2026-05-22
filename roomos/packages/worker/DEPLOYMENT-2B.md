# Phase 2B — Airbnb adapter (Mac Studio worker)

Phase 2B adds the Airbnb direct adapter alongside the existing PadSplit one. The
worker install is unchanged from Phase 1B (see `DEPLOYMENT-1B.md` §1–§3, §6–§7);
the only new operational step is a one-time interactive Airbnb login.

## 1. One-time interactive Airbnb login

```bash
pnpm worker:dev login --platform airbnb
```

A Chrome window opens at `airbnb.com/login`. Sign in normally (handle 2FA /
device verification as you would in any browser). When the host dashboard loads
(URL settles on `/hosting`), the CLI saves the session and exits. Verify:

```bash
pnpm worker:dev check --platform airbnb
# expects: "airbnb session is active"
```

> Re-running the login while already signed in is safe — it goes straight to
> `/hosting` and refreshes the saved session.

## 2. Cookie-jar encryption (decision: reuse Phase 1B's Keychain-backed AES, NOT keytar)

The Airbnb session is persisted at:

```
~/Library/Application Support/RoomOS/.auth/airbnb.json
```

This jar is **encrypted at rest** with AES-256-GCM. The 32-byte key is derived
from the **macOS Keychain** via the `security` CLI (`packages/worker/src/keychain.ts`,
service `com.cohostmgmt.roomos`), and the payload is sealed into a versioned
envelope (`packages/worker/src/cookies.ts`), written with mode `0600`. This is the
*same* mechanism that already protects the PadSplit jar (`padsplit.json`).

Phase 2B Task 4 evaluated adding `keytar` for this. We **did not** add it:

- Phase 1B already encrypts the cookie jar with a Keychain-derived key and **zero
  native npm dependencies**. `keytar`/`node-keytar` is a native module (needs
  Python + a C++ toolchain) and would complicate the Mac Studio build for no gain.
- Mirroring the existing `keychain.ts` + `cookies.ts` approach keeps the Airbnb
  and PadSplit jars consistent and equally protected.

The plaintext-file fallback the plan allowed (`chmod 600`, no encryption) was
therefore **not** used — the Airbnb jar is encrypted exactly like PadSplit's.

If you ever wipe the Keychain item (`com.cohostmgmt.roomos` / `cookie-jar-key`),
existing jars become undecryptable; just re-run the interactive login above to
mint a fresh key + jar.
