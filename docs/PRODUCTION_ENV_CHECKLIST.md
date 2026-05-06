# RuleForge Chess — Production Environment Variables

## Backend (`backend/.env`)
| Var | Required | Purpose | Production value (sample) |
|-----|----------|---------|---------------------------|
| `MONGO_URL` | ✅ | Mongo connection string | `mongodb+srv://prod-user:***@cluster0.example.net/?retryWrites=true&w=majority` |
| `DB_NAME` | ✅ | Database name | `ruleforge_prod` |
| `JWT_SECRET` | ✅ | HMAC key for tokens | _Random 256-bit string — rotate quarterly_ |
| `ADMIN_EMAIL` | ✅ | First-run admin seed | `admin@yourdomain.com` |
| `ADMIN_PASSWORD` | ✅ | First-run admin password | _Strong 16+ char random; rotate after first login_ |
| `FRONTEND_URL` | ✅ | CORS allow-list | `https://chess.yourdomain.com` |
| `BCRYPT_ROUNDS` | optional | Hash cost | `10` (current) — raise only if CPU is plentiful |
| `BCRYPT_THREAD_POOL_SIZE` | optional | bcrypt executor workers | `32` |
| `STRIPE_SECRET_KEY` | optional | Real payments | _Provided when payment integration goes live_ |
| `STRIPE_WEBHOOK_SECRET` | optional | Webhook signing | _Same as above_ |
| `SENTRY_DSN` | optional | Error tracking | _Wired in follow-up_ |

## Frontend (`frontend/.env`)
| Var | Required | Purpose | Notes |
|-----|----------|---------|-------|
| `EXPO_PUBLIC_BACKEND_URL` | ✅ | API base URL | `https://api.chess.yourdomain.com` |
| `EXPO_PACKAGER_PROXY_URL` | ✅ (dev only) | Metro proxy | Set by platform; do not change in prod |
| `EXPO_PACKAGER_HOSTNAME` | ✅ (dev only) | Metro hostname | Set by platform; do not change in prod |

## Pre-launch checklist
- [ ] All `***` placeholders replaced with real secrets
- [ ] `JWT_SECRET` rotated from any seeded value
- [ ] `ADMIN_PASSWORD` changed from `Admin@1234`
- [ ] CORS `FRONTEND_URL` set to **exact** prod domain (no `*`)
- [ ] Mongo connection string uses **dedicated** prod credentials with least-privilege role
- [ ] `BCRYPT_ROUNDS` confirmed appropriate for prod CPU profile
- [ ] All secrets stored in your secret manager, **never** committed to git
- [ ] `.env.example` files committed without secrets for onboarding
