# Terms of Service — expdevsmodbot

_Last updated: 2026-05-30_

## 1. About this app

`expdevsmodbot` is a Reddit moderation bot built on the [Devvit](https://developers.reddit.com/) platform. It is operated by the GitHub user [Watchful1](https://github.com/Watchful1) and is intended for use by the moderator team of [r/ExperiencedDevs](https://reddit.com/r/ExperiencedDevs). Source code is published at <https://github.com/Watchful1/ExpDevsModBot> under the BSD-3-Clause license.

## 2. What the app does

The app reads post and comment events from the subreddits where it is installed and applies a set of moderator-configurable rules:

- Requires posters to disclose AI tool usage via a reply to a sticky bot comment.
- Requires posters and commenters to have a user flair set on the subreddit.
- Requires the original poster to comment on their own post within a configurable window.
- Requires a minimum amount of subreddit karma to post.

Mod-visible logging may be sent to a Discord webhook URL that the installing moderator configures, exclusively for moderator observability.

## 3. Eligibility

The app is intended for use by Reddit moderators with permission to install Devvit apps on their subreddits. By installing or interacting with the app, you confirm that you are at least 13 years of age and that you comply with [Reddit's User Agreement](https://redditinc.com/policies/user-agreement) and [Content Policy](https://www.redditinc.com/policies/content-policy).

## 4. Acceptable use

You may not:

- Use the app to harass, dox, surveil, or otherwise target any individual.
- Attempt to bypass, disrupt, or reverse-engineer the app or its hosting platform.
- Use the app in a way that violates Reddit's terms or local law.

The app's automated actions (post removals, comment removals, re-approvals, sticky comments) are tools to enforce moderator-chosen policies. Moderators are responsible for the policies they configure and the outcomes of those policies on their subreddits.

## 5. No warranty

The app is provided "as is," without warranty of any kind. The author makes no guarantee that the app will be available, error-free, or fit for any particular purpose. Moderators retain full responsibility for moderation decisions on their subreddits.

## 6. Limitation of liability

To the maximum extent permitted by law, the author is not liable for any direct, indirect, incidental, consequential, or punitive damages arising from the use of, or inability to use, this app.

## 7. Changes

These terms may be updated to reflect changes in the app's functionality or applicable rules. Material changes will be announced via a commit to this repository. Continued use of the app after a change constitutes acceptance.

## 8. Contact

For questions, bug reports, or policy concerns, open an issue at <https://github.com/Watchful1/ExpDevsModBot/issues> or contact /u/Watchful1 via Reddit.
