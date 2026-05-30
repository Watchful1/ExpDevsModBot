# Privacy Policy — expdevsmodbot

_Last updated: 2026-05-30_

This policy explains what data `expdevsmodbot` accesses, how it uses that data, and what it sends outside of Reddit. The app is operated by [Watchful1](https://github.com/Watchful1) and is open source at <https://github.com/Watchful1/ExpDevsModBot>.

## What data the app reads

The app receives the following information from Reddit (via the Devvit platform):

- **Post and comment events** in the subreddit where it is installed: post id, post title visibility, author username and user id, author user flair (if any), parent comment id, raw comment body. This is required to evaluate the moderation rules described in the [Terms of Service](./terms-of-service.md).
- **Per-user karma in the installed subreddit**, fetched via Reddit's `getUserKarmaFromCurrentSubreddit` API. Used only to compare against the configured threshold; the value is not stored.
- **The moderator list** of the installed subreddit, cached for up to 15 minutes to determine whether an event author is exempt from the rules.

The app never reads private user data such as direct messages, voting history, subscriptions, browsing history, or off-Reddit profile information.

## What data the app stores

State is stored in Devvit's per-installation Redis store, which Reddit namespaces and isolates per subreddit. Stored values are minimal and short-lived:

| Key | Contents | Purpose | TTL |
|---|---|---|---|
| `bot-sticky:<postId>` | bot's sticky comment id and state machine value | track the multipurpose sticky | 24 hours |
| `engagement-sticky:<postId>` | bot's engagement-removal sticky comment id | enable re-approval cleanup | 24 hours |
| `engage:<postId>` | scheduled job id and OP username | track pending engagement check | 25 hours |
| `removed-by-us:<postId>` | marker that the bot removed the post | distinguish from human-mod removal | 24 hours |
| `processed:postsubmit:<postId>` | idempotency marker | suppress duplicate trigger delivery | 1 hour |
| `mods:cache` | array of moderator usernames | exempt-check cache | 15 minutes |

No data is retained beyond these TTLs. No data is written to external storage by this app.

## What data the app sends off-Reddit

If a moderator configures a Discord webhook URL in the app's settings and switches one or more features to a `shadow+` or `on+` mode, the app POSTs a one-sentence summary of each moderator-visible action to that webhook. A typical message looks like:

> Removed [post](https://reddit.com/comments/abc123) by u/Alice — karma 3 < threshold 10

The message includes:

- The action taken (remove, re-approve, sticky update, etc.).
- A markdown link to the affected post on reddit.com.
- The post author's username (publicly visible Reddit content).
- The triggering reason (e.g., karma below threshold, no user flair).

The message does not include private user data, voting information, IP addresses, or any data not already publicly visible on Reddit.

The Discord webhook URL is provided by the installing moderator and points to a Discord channel of their choosing. Discord's own [Privacy Policy](https://discord.com/privacy) governs how Discord handles that data once delivered. The app author has no relationship with Discord and cannot read or retrieve messages sent to the webhook.

When no Discord webhook URL is configured, or when all features are set to `off`, `shadow`, or `on` (without the `+`), no data leaves Reddit.

## Data sharing

The app does not sell, rent, license, or share any user data with any third party. The only outbound data flow is the optional moderator-configured Discord webhook described above.

## Data deletion

- Uninstalling the app from a subreddit deletes the app's Devvit Redis store for that installation. Reddit handles this deletion automatically.
- The Redis keys listed above expire automatically per their TTLs.
- Messages already delivered to a Discord webhook are subject to Discord's data handling.

## Children's privacy

The app is not directed at and is not intended to collect data from anyone under the age of 13.

## Changes

Material changes to this policy will be announced via a commit to this repository.

## Contact

Open an issue at <https://github.com/Watchful1/ExpDevsModBot/issues> or contact /u/Watchful1 via Reddit modmail.
