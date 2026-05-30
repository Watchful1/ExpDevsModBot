# expdevsmodbot

A Devvit moderation bot for [r/ExperiencedDevs](https://reddit.com/r/ExperiencedDevs). It enforces four community-policy features, each independently toggleable between **off**, **shadow** (log-only), and **on** via the install settings page.

## Features

| Feature | Trigger | What it does |
|---|---|---|
| **AI disclosure gate** | `PostSubmit` | Removes new posts and stickies a comment asking OP to confirm whether/how they used AI tools. OP's reply to the sticky re-approves the post. |
| **Flair required** | `PostSubmit`, `CommentSubmit` | Removes posts and comments by users without a user flair in the sub. |
| **OP engagement check** | scheduled job, `CommentSubmit` | If a post has ≥N comments at the engagement window mark but OP hasn't commented, removes it and stickies a notice. OP commenting later re-approves and restores the original sticky. |
| **Minimum subreddit karma** | `PostSubmit` | Removes posts by users whose combined post + comment karma in this sub is below a threshold. |

Mods (including the app account itself) are exempt from every check. Each feature except the AI gate also supports a **shadow** mode that logs what it *would* have done without taking the Reddit-visible action — useful for validating behavior before flipping a feature live.

### Multipurpose sticky

There's a single bot sticky per post that transitions through states:

- `awaiting-ai` — asking OP to disclose AI usage.
- `flair-psa` — reminding commenters that flair is required (shown after AI is satisfied if flair-required is on, or directly if AI gate is off).
- `confirmed` — acknowledgement (only when AI gate is on and flair-required is off).

When the engagement check removes a post, a separate **Track B** sticky is created with the engagement-removed body so OP gets a fresh inbox notification. Reddit allows one sticky per post; the new sticky replaces the multipurpose one until the post is re-approved.

## Tech stack

- [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview) `0.13.0`
- [Hono](https://hono.dev/) for the server endpoints
- [Vite](https://vite.dev/) for bundling
- [TypeScript](https://www.typescriptlang.org/) strict mode (`exactOptionalPropertyTypes` on)
- [Vitest](https://vitest.dev/) for unit tests

## Project layout

```
src/
├── index.ts                      # Hono bootstrap
├── config.ts                     # Modes, Redis keys, sticky body templates
├── routes/
│   ├── triggers.ts               # PostSubmit / CommentSubmit dispatchers
│   ├── scheduler.ts              # op-engagement-check callback
│   ├── menu.ts                   # Mod-only debug-state menu item
│   └── api.ts                    # (empty, reserved)
├── core/
│   ├── settings.ts               # Typed getSettings() with 5s in-memory cache
│   ├── exemptions.ts             # isModerator() with cached mod list
│   ├── logging.ts                # logFeatureAction() structured logger
│   ├── reddit-helpers.ts         # removal helpers + human-mod predicates
│   └── sticky.ts                 # Track A multipurpose sticky state machine
└── features/
    ├── ai-gate/
    ├── flair-required/
    ├── op-engagement/
    └── min-karma/
docs/
└── playtest-checklist.md         # Manual playtest matrix
```

Each feature module exposes `decide()` (mostly pure) and `apply()` (Reddit-side I/O) plus a `run()` wrapper. The dispatcher in `routes/triggers.ts` fans triggers out to features in a fixed order on `PostSubmit` (min-karma → flair → AI gate → schedule engagement) and runs them independently on `CommentSubmit`.

## Settings

Configured per install at `https://developers.reddit.com/r/<subreddit>/apps/expdevsmodbot`:

| Key | Type | Default | Description |
|---|---|---|---|
| `aiGateMode` | off / on | off | AI disclosure gate. No shadow mode (binary effect). |
| `flairMode` | off / shadow / on | off | Flair requirement for posts + comments. |
| `engagementMode` | off / shadow / on | off | 2-hour-ish OP-engagement check. |
| `minKarmaMode` | off / shadow / on | off | Subreddit-karma gate on posts. |
| `minKarmaThreshold` | number | 10 | Combined post + comment karma required. |
| `engagementWindowMinutes` | number | 120 | Window before the engagement check fires. |
| `engagementMinComments` | number | 10 | Minimum total comments before engagement check will remove. |

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Log in to Devvit:
   ```bash
   npm run login
   ```
3. Configure `devvit.json -> dev.subreddit` to point at your test subreddit.
4. Start the playtest watcher:
   ```bash
   npm run dev
   ```
5. In the test sub: open the app's install-settings page and flip features on (or to shadow).

**Required:** the app account must be a moderator of the target subreddit. Devvit auto-promotes it on install. The `getUserKarmaFromCurrentSubreddit` API used by min-karma needs this.

## Development commands

- `npm run dev` — Devvit playtest with file watching.
- `npm run type-check` — `tsc --build`.
- `npm test` — Vitest unit tests.
- `npm run lint` — ESLint over `src/`.
- `npm run build` — One-shot Vite build into `dist/`.
- `npm run deploy` — Type-check, lint, then upload a new version.
- `npm run launch` — Deploy + submit for Reddit review.

## Operations

### Streaming logs

```bash
npx devvit logs <subreddit> | grep "\[modbot\]"
```

Every action line follows:

```
[modbot] [<mode>] feature=<name> action=<verb> postId=... author=... reason="..."
```

`<mode>` is `live` or `shadow`. Useful filters:

- `grep "\[shadow\]"` — what the bot would have done during a validation period.
- `grep "feature=op-engagement"` — narrow to one feature.

### Debug menu

A mod-only post menu item, "Modbot: dump post state," dumps the bot's Redis keys for that post:

- `processed:postsubmit:<id>` — idempotency claim, proves the trigger ran.
- `bot-sticky:<id>` — Track A multipurpose sticky record.
- `engagement-sticky:<id>` — Track B record (only set after engagement removal).
- `engage:<id>` — pending engagement-check job metadata.
- `removed-by-us:<id>` — marker indicating the bot performed the most recent removal (used by the human-mod-override guard).

The full JSON is also written to `devvit logs` as `[modbot] [debug-state] {...}`.

### Roll-out

1. Deploy with all features `off` (current defaults).
2. Flip one feature to `shadow` per week.
3. Watch logs for false positives.
4. Flip to `on`.
5. Repeat for the next feature.

See `docs/playtest-checklist.md` for the manual verification matrix used during initial validation.

## Architectural notes

- **Idempotency.** Triggers can be delivered more than once. The dispatcher claims `processed:postsubmit:<postId>` via SETNX with a 1-hour TTL before any destructive action.
- **Human-mod override.** Every re-approval path checks `wasRemovedByHumanMod()`, which combines `post.removedByCategory` (`'moderator'`, `'anti_evil_ops'`, `'community_ops'`, `'content_takedown'`, `'copyright_takedown'`) with the absence of our `removed-by-us:<id>` marker. If a human mod removed the post, the bot transitions sticky state but does not undo the removal.
- **Scheduler reliability.** The engagement check is at-least-once and may run late. The scheduled handler always re-fetches post state and decides fresh — it never trusts state captured at schedule time.
- **OP reply exemption.** OP's reply to the Track A sticky is exempted from the flair check by the comment dispatcher; otherwise we'd silently remove the AI-unlock comment.
- **Settings cache.** A 5-second in-memory cache shields the settings client from burst trigger fan-out without blocking moderator-visible configuration changes for more than a few seconds.

## License

BSD-3-Clause (see `LICENSE`).
