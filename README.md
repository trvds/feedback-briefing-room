# The Feedback Journal

A three-layer feedback analysis tool built on **Cloudflare Workers**. It collects feedback, analyzes sentiment with **Workers AI**, groups related items into cases, detects “under-the-radar” issues, and produces a daily AI-generated “newspaper” edition for your team.

## Features

- **Feedback intake** — Submit and list feedback by source; optional **AI Search** for semantic similarity.
- **Sentiment analysis** — Workers AI labels and scores each piece of feedback.
- **Case grouping** — Related feedback is grouped into cases with status (open, investigating, resolved, closed).
- **Under-the-radar detection** — Flags high-severity or easily missed feedback.
- **Daily newspaper** — A cron job (08:00 UTC) runs a workflow that generates a daily briefing from recent feedback and cases.
- **UI** — Newsroom view (daily edition) and Court view (cases and under-the-radar flags).

## Tech stack

| Layer         | Technology                             |
| ------------- | -------------------------------------- |
| Runtime       | Cloudflare Workers                     |
| Database      | D1                                     |
| AI            | Workers AI                             |
| Search        | AI Search (optional, via dashboard)    |
| Orchestration | Workflows (feedback + daily newspaper) |
| Scheduler     | Cron (daily at 08:00 UTC)              |

## Project structure

```
src/
├── index.ts              # Worker entry: routing, cron, /init
├── routes/
│   ├── api.ts            # REST API handlers
│   └── pages.ts          # HTML pages (newsroom, court)
├── services/
│   ├── ai.ts             # Workers AI (sentiment, edition generation)
│   ├── database.ts       # D1 access
│   ├── newsroomEdition.ts
│   ├── search.ts         # AI Search
│   └── underRadarDetector.ts
├── workflows/
│   ├── feedbackWorkflow.ts      # Per-feedback: analyze, group, under-radar
│   └── dailyNewspaperWorkflow.ts # Daily edition generation
├── templates/            # HTML + CSS for newsroom & court
└── utils/
    ├── mockData.ts
    └── scoring.ts
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (included as dev dependency)
- A Cloudflare account with D1, Workers AI, and Workflows enabled

## Setup

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd feedback-tool
   npm install
   ```

2. **Create the D1 database** (if needed)

   ```bash
   npm run db:create
   ```

   Then set `database_id` in `wrangler.toml` under `[[d1_databases]]` to the ID returned.

3. **Apply the schema**

   ```bash
   npm run db:migrate       # production D1
   npm run db:migrate:local # local D1 (for dev)
   ```

4. **Optional: AI Search**  
   The `[ai]` binding in `wrangler.toml` is used for both Workers AI and AI Search (via `env.AI.autorag("instance-name")`). This app’s code, however, expects a binding named **`SEARCH`** (`env.SEARCH`). That binding is not defined in wrangler, so `env.SEARCH` is undefined at runtime and search features are no-ops or fail gracefully. To use AI Search: **(1)** Create an AI Search instance in the Cloudflare dashboard (data source, indexing, etc.). **(2)** Either add a binding in **Dashboard → Workers → your worker → Settings → Bindings** named `SEARCH` that links to your AI Search instance, or change the code to use `env.AI.autorag("your-instance-name")` and adapt `AISearchService` to that API. The app works without it; search/grouping will be limited.

5. **Local development**

   ```bash
   npm run dev
   ```

   Then open `http://localhost:8787`. To seed mock feedback and run workflows locally:

   ```bash
   npm run init:local
   ```

## Scripts

| Script                     | Description                                 |
| -------------------------- | ------------------------------------------- |
| `npm run dev`              | Start local dev server (`wrangler dev`)     |
| `npm run deploy`           | Deploy worker to Cloudflare                 |
| `npm run db:migrate`       | Apply D1 migrations (remote)                |
| `npm run db:migrate:local` | Apply D1 migrations (local)                 |
| `npm run db:create`        | Create D1 database                          |
| `npm run db:console`       | Open local D1 SQL console                   |
| `npm run init:local`       | `POST /init` to seed mock data (local only) |

## API overview

| Method | Path                      | Description                                                                |
| ------ | ------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/feedback`           | List feedback (optional `?source=&limit=&offset=`)                         |
| GET    | `/api/feedback/:id`       | Get one feedback                                                           |
| POST   | `/api/feedback`           | Submit feedback (triggers feedback workflow)                               |
| GET    | `/api/under-radar`        | List under-the-radar flags                                                 |
| GET    | `/api/edition/latest`     | Latest daily edition                                                       |
| GET    | `/api/edition/YYYY-MM-DD` | Edition by date                                                            |
| GET    | `/api/editions`           | List edition dates                                                         |
| GET    | `/api/cases`              | List cases                                                                 |
| GET    | `/api/cases/:id`          | Get one case with feedback                                                 |
| POST   | `/api/cases`              | Create case                                                                |
| POST   | `/api/analyze`            | Run sentiment analysis on a feedback ID (body: `{ "feedbackId": number }`) |
| POST   | `/api/edition/regenerate` | Regenerate latest edition (body: `{ "edition_date": "YYYY-MM-DD" }`)       |

## Pages

- **`/` or `/newsroom.html`** — Daily edition (top story, cases, under-the-radar).
- **`/court.html`** — Cases and under-the-radar list with expandable details.

## Architecture (high level)

- A single Worker serves UI and API and triggers two Workflows:
  - **Feedback workflow** — On new feedback: sentiment, grouping into cases, under-the-radar detection; uses D1, Workers AI, and optionally AI Search.
  - **Daily newspaper workflow** — Cron at 08:00 UTC: loads data from D1, generates the edition with Workers AI, stores it in D1.

For a detailed architecture diagram, Cloudflare product notes, and possible improvements, see [info/info.md](info/info.md).

## License

See repository for license information.
