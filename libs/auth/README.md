# @autoscanner/auth

Pure helpers (no Nest dependency) used by api-gateway's auth module.

- `PasswordService` — argon2id hash/verify
- `signAccessToken` / `verifyAccessToken` — short-lived JWT (HS512)
- `generateRefreshToken` / `hashRefreshToken` — opaque 64-hex refresh tokens, stored SHA-256-hashed
- `TotpService` — secret generation, otpauth URI, code verification (Phase 0: helpers only, not wired into a flow)
