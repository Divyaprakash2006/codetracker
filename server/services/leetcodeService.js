'use strict';

const axios = require('axios');

// ─── LeetCode Official GraphQL Endpoint ───────────────────────────────────────
const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

// ─── Confirmed-working headers ────────────────────────────────────────────────
const GQL_HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json',
  'Origin':       'https://leetcode.com',
  'Referer':      'https://leetcode.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

// ─── GraphQL Queries ──────────────────────────────────────────────────────────
// Fields confirmed valid against LeetCode's live schema.
// ❌ Removed: contributionPoints, reputation  (cause HTTP 400)

const QUERY_USER_PROFILE = `
  query getUserProfile($username: String!) {
    matchedUser(username: $username) {
      username
      profile {
        realName
        userAvatar
        ranking
      }
      badges {
        id
        name
        icon
      }
      activeBadge {
        id
        name
        icon
      }
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
      }
      userCalendar {
        activeYears
        streak
        totalActiveDays
        submissionCalendar
      }
    }
    allQuestionsCount {
      difficulty
      count
    }
    userContestRanking(username: $username) {
      attendedContestsCount
      rating
      globalRanking
      topPercentage
    }
  }
`;

const QUERY_RECENT_SUBMISSIONS = `
  query getRecentSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      title
      titleSlug
      timestamp
      lang
    }
  }
`;

// ─── Retry with Exponential Backoff ───────────────────────────────────────────
// Retries on 429 / 5xx / network failures — NOT on 400 (schema error).
const withRetry = async (fn, retries = 3, baseDelay = 2000) => {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      // 400 = bad request (our fault) — fail immediately, don't retry
      const isRetryable = !status || status === 429 || status >= 500;
      if (!isRetryable || attempt === retries) break;

      const delay  = baseDelay * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 500);
      console.warn(
        `[GraphQL] HTTP ${status ?? 'network'} — retry ${attempt + 1}/${retries} ` +
        `in ${((delay + jitter) / 1000).toFixed(1)}s`
      );
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
  throw lastErr;
};

// ─── Raw GraphQL POST ─────────────────────────────────────────────────────────
const gqlQuery = async (queryStr, variables = {}, credentials = {}) => {
  const headers = { ...GQL_HEADERS };
  const LEETCODE_SESSION = credentials.leetcodeSession || process.env.LEETCODE_SESSION;
  const LEETCODE_CSRF_TOKEN = credentials.leetcodeCsrfToken || process.env.LEETCODE_CSRF_TOKEN;

  if (LEETCODE_SESSION) {
    headers['Cookie'] = `LEETCODE_SESSION=${LEETCODE_SESSION}; csrftoken=${LEETCODE_CSRF_TOKEN || ''}`;
  }
  if (LEETCODE_CSRF_TOKEN) {
    headers['X-CSRFToken'] = LEETCODE_CSRF_TOKEN;
  }

  const res = await withRetry(() =>
    axios.post(
      LEETCODE_GRAPHQL,
      { query: queryStr, variables },
      { headers, timeout: 20000 }
    )
  );

  const { data, errors } = res.data;
  if (errors && errors.length > 0) {
    throw new Error(errors.map(e => e.message).join('; '));
  }
  return data;
};

// ─── Batch Difficulty Fetcher ─────────────────────────────────────────────────
/**
 * Fetches difficulty for multiple problem slugs in a SINGLE GraphQL request
 * using field aliases. Returns { [titleSlug]: 'Easy'|'Medium'|'Hard' }.
 *
 * Example query built:
 *   query getDifficulties {
 *     q0: question(titleSlug: "two-sum") { difficulty }
 *     q1: question(titleSlug: "symmetric-tree") { difficulty }
 *   }
 */
const fetchDifficultiesForSlugs = async (slugs, credentials = {}) => {
  const unique = [...new Set(slugs.filter(Boolean))];
  if (!unique.length) return {};

  // Map alias → slug for reverse lookup
  const aliasToSlug = {};
  const fields = unique.map((slug, i) => {
    const alias = `q${i}`;
    aliasToSlug[alias] = slug;
    return `${alias}: question(titleSlug: "${slug}") { difficulty }`;
  }).join('\n    ');

  const queryStr = `query getDifficulties {\n    ${fields}\n  }`;

  try {
    const data = await gqlQuery(queryStr, {}, credentials);
    const result = {};
    for (const [alias, slug] of Object.entries(aliasToSlug)) {
      result[slug] = capitalizeDiff(data[alias]?.difficulty) || 'Unknown';
    }
    return result;
  } catch (err) {
    console.warn('[GraphQL] Could not fetch difficulties batch:', err.message);
    return {};
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const diffCount = (acNums, diff) =>
  acNums?.find(d => d.difficulty === diff)?.count ?? 0;

const totalCount = (allQ, diff) =>
  allQ?.find(d => d.difficulty === diff)?.count ?? 0;

const capitalizeDiff = (str) => {
  if (!str) return 'Unknown';
  const map = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  return map[str.toLowerCase()] || str;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch user profile + solved breakdown via LeetCode GraphQL.
 */
const fetchUserProfile = async (username, credentials = {}) => {
  try {
    const data = await gqlQuery(QUERY_USER_PROFILE, { username }, credentials);

    const user = data.matchedUser;
    if (!user) {
      throw new Error(`LeetCode user "${username}" not found.`);
    }

    const acNums  = user.submitStatsGlobal?.acSubmissionNum || [];
    const profile = user.profile || {};
    const allQ    = data.allQuestionsCount || [];

    const easySolved   = diffCount(acNums, 'Easy');
    const mediumSolved = diffCount(acNums, 'Medium');
    const hardSolved   = diffCount(acNums, 'Hard');
    const totalSolved  = diffCount(acNums, 'All') || (easySolved + mediumSolved + hardSolved);

    const formatIcon = (url) => {
      if (!url) return '';
      if (url.startsWith('http')) return url;
      return `https://leetcode.com${url}`;
    };

    const badges = (user.badges || []).map(b => ({
      id: b.id,
      name: b.name,
      icon: formatIcon(b.icon)
    }));

    const activeBadge = user.activeBadge ? {
      id: user.activeBadge.id,
      name: user.activeBadge.name,
      icon: formatIcon(user.activeBadge.icon)
    } : null;

    const contest = data.userContestRanking || {};
    const contestCount = contest.attendedContestsCount || 0;
    const contestRating = contest.rating ? Math.round(contest.rating) : null;
    const contestGlobalRanking = contest.globalRanking || null;
    const contestTopPercent = contest.topPercentage || null;

    const userCalendar = user.userCalendar || {};
    const streak = userCalendar.streak || 0;
    const totalActiveDays = userCalendar.totalActiveDays || 0;
    const submissionCalendar = userCalendar.submissionCalendar || '{}';

    return {
      username:       user.username.toLowerCase(),
      displayName:    profile.realName || user.username,
      avatar:         profile.userAvatar || '',
      ranking:        profile.ranking || 0,
      totalSolved,
      easySolved,
      mediumSolved,
      hardSolved,
      easyTotal:      totalCount(allQ, 'Easy'),
      mediumTotal:    totalCount(allQ, 'Medium'),
      hardTotal:      totalCount(allQ, 'Hard'),
      totalQuestions: totalCount(allQ, 'All') || 0,
      badges,
      activeBadge,
      contestCount,
      contestRating,
      contestGlobalRanking,
      contestTopPercent,
      streak,
      totalActiveDays,
      submissionCalendar
    };
  } catch (err) {
    console.error(`[GraphQL] Profile fetch failed for "${username}":`, err.message);
    throw new Error(
      err.message.includes('not found')
        ? err.message
        : `Could not fetch data for "${username}". Check the username exists on LeetCode.`
    );
  }
};

/**
 * Fetch recent accepted submissions with REAL difficulty via:
 *  1. recentAcSubmissionList  → id, title, titleSlug, timestamp, lang
 *  2. Batch alias query        → difficulty per titleSlug (one request)
 * Returns [] on error so profile sync always completes.
 */
const QUERY_SUBMISSION_DETAILS = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      code
    }
  }
`;

const fetchSubmissionCode = async (submissionId, credentials = {}) => {
  const LEETCODE_SESSION = credentials.leetcodeSession || process.env.LEETCODE_SESSION;
  if (!LEETCODE_SESSION) return null;
  
  try {
    const data = await gqlQuery(QUERY_SUBMISSION_DETAILS, { submissionId: parseInt(submissionId) }, credentials);
    return data.submissionDetails?.code || null;
  } catch (err) {
    console.warn(`[GraphQL] Failed to fetch code for submission ${submissionId}:`, err.message);
    return null;
  }
};

const fetchRecentSubmissions = async (username, limit = 20, credentials = {}) => {
  try {
    // Step 1: get the submission list
    const data = await gqlQuery(QUERY_RECENT_SUBMISSIONS, { username, limit }, credentials);
    const list = data.recentAcSubmissionList || [];

    if (!list.length) return [];

    // Step 2: batch-fetch difficulty for all unique problem slugs (1 extra request)
    const slugs         = list.map(s => s.titleSlug);
    const difficultyMap = await fetchDifficultiesForSlugs(slugs, credentials);

    // Step 3: merge difficulty into each submission record
    const resultList = list.map(s => ({
      username:     username.toLowerCase(),
      title:        s.title || s.titleSlug || 'Unknown',
      titleSlug:    s.titleSlug || '',
      difficulty:   difficultyMap[s.titleSlug] || 'Unknown',
      lang:         s.lang || 'unknown',
      langName:     s.lang || '',
      status:       'Accepted',
      timestamp:    s.timestamp ? new Date(parseInt(s.timestamp) * 1000) : new Date(),
      submissionId: String(s.id || Math.random()),
    }));
    return resultList;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      console.warn(`[GraphQL] Rate-limited for "${username}" submissions — skipping this cycle.`);
    } else {
      console.error(`[GraphQL] Submission fetch failed for "${username}":`, err.message);
    }
    return [];
  }
};

/**
 * Returns true if the username exists on LeetCode.
 */
const validateUser = async (username, credentials = {}) => {
  try {
    const data = await gqlQuery(QUERY_USER_PROFILE, { username }, credentials);
    return !!data.matchedUser;
  } catch {
    return false;
  }
};

module.exports = { fetchUserProfile, fetchRecentSubmissions, validateUser, fetchSubmissionCode };

