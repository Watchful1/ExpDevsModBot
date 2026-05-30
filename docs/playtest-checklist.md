# Playtest checklist

Manual verification scenarios for the modbot. Run against a private test subreddit via `npm run dev` (devvit playtest). Use alt accounts for the "low-karma" and "flairless" roles.

## Setup

- Install the app on the test sub. Confirm:
  - `devvit logs <sub>` shows `App installed to subreddit: r/<sub>`.
  - The app account appears in the sub's moderator list.
  - Settings page lists all seven knobs with default `off`.
- Verify the moderator-only menu item "Modbot: dump post state" is visible on posts.

## Per-feature matrix

### min-karma

| Mode | Scenario | Expected |
|---|---|---|
| off | low-karma alt posts | no action, no log |
| shadow | low-karma alt posts | post visible; log line `[shadow] feature=min-karma action=remove-post ... karma=N threshold=10` |
| shadow | high-karma alt posts (or actual mod) | no log |
| on | low-karma alt posts | post removed; sticky comment posted; log line `[live] feature=min-karma action=remove-post ...` |
| on | mod posts (any karma) | no action; mod exemption short-circuits dispatcher |

### flair-required

| Mode | Scenario | Expected |
|---|---|---|
| off | flairless alt posts | no action |
| shadow | flairless alt posts/comments | log lines for both; content visible |
| on | flairless alt posts | post removed; sticky `Modbot: User flair required` comment |
| on | flairless alt comments | comment removed silently; log line |
| on | AutoMod distinguished comment | no action (AutoMod is a mod → exempt) |
| on | OP reply to AI sticky (flairless OP) | exempt — comment NOT removed |
| on | mod posts (no flair) | no action |

### ai-gate

Test with `aiGateMode=on`, `flairMode` varying.

| flairMode | Scenario | Expected |
|---|---|---|
| off | post submitted | post removed; sticky with `awaiting-ai` body; OP gets notification |
| off | OP replies "yes I used ChatGPT" to sticky | post re-approved; sticky body edited to `confirmed` |
| off | non-OP replies to sticky | no action |
| off | OP replies, then human mod removes post | (after mod removal) sticky stays at `confirmed` but post is removed; bot does NOT re-approve |
| on | post submitted | post removed; sticky `awaiting-ai` |
| on | OP replies | post re-approved; sticky transitions to `flair-psa` |
| on | flairless OP reply | OP's reply is exempt from flair removal (Track A guard) |

### op-engagement

Test with `engagementMode=on`, `engagementWindowMinutes=2` for faster cycles, `engagementMinComments=3`.

| Scenario | Expected |
|---|---|
| post submitted; 5 comments by others; OP silent at 2m | post removed; Track B sticky with `engagement-removed` body; OP gets notification (new comment) |
| post submitted; 2 comments by others; OP silent at 2m | not removed (below threshold); log `action=skip reason="comment count 2 < threshold 3"` |
| post submitted; OP comments at 1m | not removed at 2m |
| post removed at 2m; OP comments 5m later | post re-approved; Track B comment deleted; Track A sticky re-stickied (if it existed) |
| post manually removed by mod before 2m | not re-removed; log `action=skip reason="post manually removed by a mod"` |
| AI gate also on, post removed by AI gate, OP never replied | engagement check fires, sees `removed-by-us` marker → skips |

### Cross-feature

| Scenario | Expected |
|---|---|
| All features on; low-karma flairless OP posts | removed by min-karma (first check); single removal sticky; flair/ai-gate skip (alreadyRemoved=true); engagement still schedules but exits at fire time |
| Post deleted by OP between submit and engagement fire | log `action=skip reason="failed to fetch post; assuming deleted"` |
| Duplicate PostSubmit delivery for same post | second delivery short-circuits at `processed:postsubmit` claim |

## Debug menu

For any post during testing:
- Click "Modbot: dump post state" → toast lists Redis keys.
- After PostSubmit: expect `processed:postsubmit: 1`.
- After AI-gate removal: expect `bot-sticky` and `removed-by-us` populated.
- After engagement removal: expect `engagement-sticky` populated.
- After re-approval: corresponding sticky / removed-by-us keys cleared.

## Roll-out plan

1. Deploy with all four feature modes `off`.
2. Flip one feature to `shadow` per week.
3. Watch `devvit logs <sub> | grep modbot` for at least 3 days per feature.
4. Confirm the bot would have removed the cases you expect and only those cases.
5. Flip the feature to `on`. Monitor modmail and post removals dashboard for false positives.
6. Repeat for the next feature.

## Required permissions / setup

- The app account must be a moderator of r/ExperiencedDevs (granted automatically at install).
- The app account needs the `reddit` capability (already in `devvit.json -> permissions`).
- No external services or secrets required.
