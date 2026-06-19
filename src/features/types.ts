import type { T3 } from '@devvit/shared-types/tid.js';

/**
 * Normalized inputs derived from the raw Devvit trigger payload, so feature
 * handlers don't all have to defensively unpack optional fields.
 */
export type PostSubmitInput = {
  postId: T3;
  authorId: string;
  authorName: string;
  /** True if the post had a user flair value on the event payload. */
  authorHasFlair: boolean;
  /** Trimmed post link-flair text (the topic flair), if any. */
  postFlairText: string | undefined;
};

export type CommentSubmitInput = {
  commentId: string;
  postId: T3;
  parentId: string;
  authorId: string;
  authorName: string;
  authorHasFlair: boolean;
  body: string;
};

export type FeatureResult = {
  /** True if this feature caused (or would have caused) post removal. */
  removed: boolean;
};

/**
 * Context shared across feature dispatch on a single trigger. Allows later
 * features to short-circuit destructive actions if an earlier feature already
 * removed the post.
 */
export type DispatchContext = {
  alreadyRemoved: boolean;
};
