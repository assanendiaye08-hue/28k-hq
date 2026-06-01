# 28K HQ

> A Discord server ecosystem that turns gamers into hustlers — through gamification, an AI coach, and competitive leaderboards, paired with a native desktop companion app.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)

28K HQ is a productivity platform built for a small community of ambitious people who already live on Discord. Discord handles community, AI coaching, and social proof; a native desktop app (macOS + Windows, built with Tauri) handles the visual side — a focus timer in the menu bar, goal views, and a daily dashboard. Both share the same database and API, so progress stays in sync everywhere.

The core idea: make hustling feel like the game. The same psychology that keeps gamers grinding — XP, ranks, streaks, leaderboards, seasons — is pointed at real-world goals instead.

---

## Features

### Discord bot — "Jarvis" AI coach
- **Conversational coaching** — natural-language DMs instead of slash commands for goals, check-ins, tasks, and reminders (Grok 4.1 Fast primary, DeepSeek fallback via OpenRouter)
- **Daily rhythm** — morning briefs, evening reflections, weekly planning, and smart nudges, capped at a few touchpoints per day
- **Gamification** — XP engine, rank/role progression, multi-dimensional leaderboards (XP, voice, streaks), and a Valorant-style seasonal system
- **Voice co-working** — "lock-in" sessions with AFK detection, promoted as the flagship social feature
- **Streaks that forgive** — two-day rule and consistency rates instead of hard resets
- **Privacy first** — per-member AES-256-GCM encryption at rest, owner-blind by design, plus `/mydata` export and `/deletedata` hard delete
- **Coaching settings** — per-user control over which proactive features run, quiet hours, and onboarding with timezone resolution

### Desktop app — 28K HQ
- **Focus timer** — Pomodoro and Flowmodoro (count-up with proportional breaks), local-first with background API sync and an XP reward loop
- **Menu bar / system tray** — live countdown without opening the window
- **Goals** — create, update progress, and complete goals straight from the desktop
- **Today dashboard** — current priority, weekly goals, streak/rank, daily quote, and a "who's grinding" indicator
- **Native feel** — dark theme with amber accents, Discord OAuth login, auto-updater, and autostart

---

## Monorepo structure

A [Turborepo](https://turbo.build/) + [pnpm](https://pnpm.io/) workspace:

```
28k-hq/
├── apps/
│   ├── bot/        @28k/bot      — Discord bot (discord.js, the Jarvis coach)
│   ├── api/        @28k/api      — REST API (Fastify) shared by bot + desktop
│   └── desktop/    @28k/desktop  — Tauri v2 desktop app (React + Rust shell)
├── packages/
│   ├── db/         @28k/db       — Prisma schema + client (PostgreSQL)
│   └── shared/     @28k/shared   — shared types and utilities
├── deploy/                       — VPS deploy hook
└── ecosystem.config.cjs          — PM2 process config (bot + api)
```

## Tech stack

| Area      | Stack |
|-----------|-------|
| Language  | TypeScript (Node.js 22) |
| Bot       | discord.js 14, node-cron, chrono-node, rss-parser, winston |
| API       | Fastify 5, JWT + cookie auth, Discord OAuth (PKCE), rate limiting |
| Desktop   | Tauri v2 (Rust), React 19, React Router 7, Zustand, Tailwind CSS 4, Vite |
| Database  | PostgreSQL via Prisma 7 |
| AI        | OpenRouter — Grok 4.1 Fast (primary) + DeepSeek V3.2 (fallback) |
| Tooling   | Turborepo, pnpm, Vitest, ESLint, Prettier |
| Ops       | PM2, GitHub Actions (desktop release builds) |

---

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable`)
- [PostgreSQL](https://www.postgresql.org/) 14+
- A [Discord application](https://discord.com/developers/applications) (bot token + OAuth client)
- An [OpenRouter](https://openrouter.ai/) API key
- [Rust](https://www.rust-lang.org/tools/install) (only needed to build the desktop app)

### 1. Clone and install

```bash
git clone https://github.com/assanendiaye08-hue/28k-hq.git
cd 28k-hq
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then fill in the values:

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Discord bot token |
| `DISCORD_CLIENT_ID` | Discord application client ID |
| `DISCORD_GUILD_ID` | Target Discord server (guild) ID |
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | OpenRouter API key for the AI coach |
| `OWNER_DISCORD_ID` | Your Discord user ID (owner-only features) |
| `MASTER_ENCRYPTION_KEY` | 32-byte hex key — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | `development` or `production` |

> The API and desktop app read their own front-end variables (e.g. `VITE_API_URL`, `VITE_DISCORD_CLIENT_ID`) — see `apps/desktop/.env.production` for the format.

### 3. Set up the database

```bash
pnpm db:generate   # generate the Prisma client
pnpm db:migrate    # apply migrations
```

### 4. Run

```bash
pnpm dev            # run everything via Turborepo
pnpm dev:bot        # bot only
```

Register the bot's slash commands once (and after changing them):

```bash
pnpm deploy-commands
```

---

## Desktop app

```bash
cd apps/desktop
pnpm tauri dev      # run the desktop app in development
pnpm tauri build    # produce a release bundle for your platform
```

Pre-built installers are published on the [Releases page](https://github.com/assanendiaye08-hue/28k-hq/releases/latest). Installation steps (including the unsigned-app workaround on macOS and Windows SmartScreen) are in [INSTALL.md](INSTALL.md).

Release builds are produced automatically by GitHub Actions when a `desktop-v*` tag is pushed, covering macOS (Apple Silicon + Intel) and Windows.

---

## Deployment

The bot and API run on a VPS under [PM2](https://pm2.keymetrics.io/):

```bash
pnpm build
pm2 start ecosystem.config.cjs   # starts 28k-bot and 28k-api
```

`deploy/post-receive` is a git hook for push-to-deploy onto the VPS — see the comments at the top of that file for one-time setup.

## Available scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all apps in dev mode (Turborepo) |
| `pnpm build` | Build all apps and packages |
| `pnpm dev:bot` / `pnpm build:bot` | Bot only |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm deploy-commands` | Register Discord slash commands |

---

## Contributing

Contributions are welcome. Open an issue to discuss a change, or send a pull request:

1. Fork the repo and create a branch (`git checkout -b feature/your-feature`)
2. Make your changes (`pnpm build` and `pnpm test` should pass)
3. Commit and open a pull request against `main`

## Contributors

- [@assanendiaye08-hue](https://github.com/assanendiaye08-hue) — creator and maintainer

## License

Released under the [MIT License](LICENSE).
