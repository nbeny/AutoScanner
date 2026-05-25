# @autoscanner/common

Shared domain primitives reused across libs and apps.

- `DomainError` hierarchy (`NotFoundError`, `InvalidCredentialsError`, …)
- `SecretBox` — AES-256-GCM authenticated encryption (used for TOTP secrets, credential storage, notification channel configs)
