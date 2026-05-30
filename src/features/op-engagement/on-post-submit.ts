import { scheduler } from '@devvit/web/server';
import { SCHEDULED_JOB_NAMES } from '../../config';
import { logFeatureAction } from '../../core/logging';
import type { ResolvedSettings } from '../../core/settings';
import type {
  FeatureResult,
  PostSubmitInput,
} from '../types';
import { setEngagementJob } from './state';

/**
 * Schedule the 2h (configurable) engagement check for a new post. Always
 * schedules when the feature is on/shadow, regardless of whether earlier
 * features removed the post — the scheduled handler is idempotent and
 * re-checks state at fire time. This avoids needing to cancel jobs from the
 * dispatcher hot path.
 */
export async function run(
  input: PostSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  if (settings.engagementMode === 'off') {
    return { removed: false };
  }

  const delayMs = settings.engagementWindowMinutes * 60 * 1000;
  const runAt = new Date(Date.now() + delayMs);
  let jobId: string;
  try {
    jobId = await scheduler.runJob({
      name: SCHEDULED_JOB_NAMES.opEngagementCheck,
      runAt,
      data: { postId: input.postId, authorId: input.authorId, authorName: input.authorName },
    });
  } catch (err) {
    console.warn(`op-engagement: failed to schedule check for ${input.postId}`, err);
    return { removed: false };
  }

  await setEngagementJob(input.postId, {
    jobId,
    authorId: input.authorId,
    authorName: input.authorName,
    scheduledAt: runAt.getTime(),
  });
  logFeatureAction({
    feature: 'op-engagement',
    mode: settings.engagementMode,
    action: 'schedule-check',
    postId: input.postId,
    authorName: input.authorName,
    reason: `scheduled engagement check in ${settings.engagementWindowMinutes}m`,
    extra: { jobId, runAt: runAt.toISOString() },
  });
  return { removed: false };
}
