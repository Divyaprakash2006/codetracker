const Account = require('../models/Account.model');
const User = require('../models/User.model');
const Submission = require('../models/Submission.model');
const { fetchUserProfile, fetchRecentSubmissions, validateUser, fetchSubmissionCode } = require('../services/leetcodeService');

const getOwnerCredentials = async (email) => {
  try {
    const account = await Account.findOne({ email: email.toLowerCase() });
    if (account) {
      return {
        leetcodeSession: account.leetcodeSession || null,
        leetcodeCsrfToken: account.leetcodeCsrfToken || null
      };
    }
  } catch (err) {
    console.error('Error fetching credentials for', email, err.message);
  }
  return {};
};

// ─── GET /api/users ───────────────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const owner = req.user.email;
    const users = await User.find({ owner, isActive: true }).sort({ totalSolved: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/users ──────────────────────────────────────────────────────────
const addUser = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }

    const clean = username.trim().toLowerCase();
    const owner = req.user.email;

    // Check if already tracked by this owner
    const userExists = await User.findOne({ owner, username: clean });
    if (userExists) {
      return res.status(409).json({ success: false, error: `"${clean}" is already being tracked.` });
    }

    // Fetch owner credentials
    const credentials = await getOwnerCredentials(owner);

    // Validate on LeetCode
    const exists = await validateUser(clean, credentials);
    if (!exists) {
      return res.status(404).json({ success: false, error: `LeetCode user "${clean}" not found.` });
    }

    // Fetch initial data
    const profile = await fetchUserProfile(clean, credentials);
    const userData = {
      ...profile,
      username: clean,
      owner,
      isActive: true,
      addedAt: new Date(),
      lastSynced: new Date(),
      syncError: null
    };

    const newUser = new User(userData);
    await newUser.save();

    // Fetch and store submissions
    const submissions = await fetchRecentSubmissions(clean, 20, credentials);
    if (submissions.length > 0) {
      const bulkOps = submissions.map(sub => ({
        updateOne: {
          filter: { owner, username: clean, submissionId: sub.submissionId },
          update: {
            $set: {
              ...sub,
              username: clean,
              owner,
              timestamp: sub.timestamp instanceof Date ? sub.timestamp : new Date(sub.timestamp)
            }
          },
          upsert: true
        }
      }));
      await Submission.bulkWrite(bulkOps);
    }

    res.status(201).json({ success: true, data: userData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE /api/users/:username ──────────────────────────────────────────────
const removeUser = async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const owner = req.user.email;

    const user = await User.findOne({ owner, username });
    if (!user) {
      return res.status(404).json({ success: false, error: `User "${username}" not found.` });
    }
    await User.deleteOne({ owner, username });

    // Delete all submissions for this user & owner
    await Submission.deleteMany({ owner, username });

    res.json({ success: true, message: `"${username}" removed from tracker.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/users/:username ─────────────────────────────────────────────────
const getUserDetail = async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const owner = req.user.email;

    const user = await User.findOne({ owner, username });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found in tracker.' });
    }

    // Get submissions for user & owner
    const submissions = await Submission.find({ owner, username })
      .sort({ timestamp: -1 })
      .limit(20);

    res.json({ success: true, data: { ...user.toObject(), submissions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/users/:username/submissions ─────────────────────────────────────
const getUserSubmissions = async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const owner = req.user.email;
    const limitVal = parseInt(req.query.limit) || 20;

    const submissions = await Submission.find({ owner, username })
      .sort({ timestamp: -1 })
      .limit(limitVal);

    res.json({ success: true, count: submissions.length, data: submissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/users/sync ─────────────────────────────────────────────────────
const syncAllUsers = async (req, res) => {
  try {
    const owner = req.user.email;
    const users = await User.find({ owner, isActive: true });
    if (users.length === 0) {
      return res.json({ success: true, message: 'No users to sync.', synced: 0, report: [] });
    }

    const report = [];

    // Load credentials for this owner
    const credentials = await getOwnerCredentials(owner);

    // Process sequentially to avoid rate-limiting LeetCode GraphQL
    for (const u of users) {
      try {
        // 1. Fetch fresh data from LeetCode GraphQL
        const profile     = await fetchUserProfile(u.username, credentials);
        const submissions = await fetchRecentSubmissions(u.username, 20, credentials);

        // 2. Update user profile
        await User.updateOne(
          { owner, username: u.username },
          {
            $set: {
              ...profile,
              lastSynced: new Date(),
              syncError: null
            }
          }
        );

        // 3. Insert fresh submissions
        if (submissions.length > 0) {
          const bulkOps = submissions.map(sub => ({
            updateOne: {
              filter: { owner, username: u.username, submissionId: sub.submissionId },
              update: {
                $set: {
                  ...sub,
                  username: u.username,
                  owner,
                  timestamp: sub.timestamp instanceof Date ? sub.timestamp : new Date(sub.timestamp)
                }
              },
              upsert: true
            }
          }));
          await Submission.bulkWrite(bulkOps);
        }

        report.push({
          username: u.username,
          status:   'synced',
          solved:   profile.totalSolved,
          submissions: submissions.length,
        });
      } catch (err) {
        await User.updateOne(
          { owner, username: u.username },
          {
            $set: {
              syncError: err.message,
              lastSynced: new Date()
            }
          }
        );
        report.push({ username: u.username, status: 'error', error: err.message });
      }

      // Polite delay between users to avoid rate limits
      if (users.indexOf(u) < users.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    res.json({ success: true, synced: users.length, report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/leaderboard ─────────────────────────────────────────────────────
const getLeaderboard = async (req, res) => {
  try {
    const owner = req.user.email;
    const { startDate, endDate, sortBy } = req.query;

    const users = await User.find({ owner, isActive: true });
    
    // Calculate period statistics if requested
    const periodSolvedMap = {};
    const hasPeriod = !!(startDate && endDate);

    if (hasPeriod) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Query submissions for this owner within the date range directly
      const submissions = await Submission.find({
        owner,
        timestamp: { $gte: start, $lte: end }
      });
      
      submissions.forEach(sub => {
        const uName = sub.username.toLowerCase();
        if (!periodSolvedMap[uName]) {
          periodSolvedMap[uName] = { total: 0, easy: 0, medium: 0, hard: 0 };
        }
        periodSolvedMap[uName].total++;
        const diff = sub.difficulty;
        if (diff === 'Easy') periodSolvedMap[uName].easy++;
        else if (diff === 'Medium') periodSolvedMap[uName].medium++;
        else if (diff === 'Hard') periodSolvedMap[uName].hard++;
      });
    }

    const board = users.map(u => {
      const uName = u.username.toLowerCase();
      const periodSolved = hasPeriod
        ? (periodSolvedMap[uName] || { total: 0, easy: 0, medium: 0, hard: 0 })
        : null;
      return {
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        totalSolved: u.totalSolved,
        easySolved: u.easySolved,
        mediumSolved: u.mediumSolved,
        hardSolved: u.hardSolved,
        ranking: u.ranking,
        easyTotal: u.easyTotal,
        mediumTotal: u.mediumTotal,
        hardTotal: u.hardTotal,
        totalQuestions: u.totalQuestions,
        activeBadge: u.activeBadge,
        badges: u.badges || [],
        contestCount: u.contestCount,
        contestRating: u.contestRating,
        contestGlobalRanking: u.contestGlobalRanking,
        contestTopPercent: u.contestTopPercent,
        lastSynced: u.lastSynced,
        periodSolved
      };
    });

    // Dynamic sorting
    if (hasPeriod && sortBy === 'period') {
      board.sort((a, b) => {
        const aVal = a.periodSolved ? a.periodSolved.total : 0;
        const bVal = b.periodSolved ? b.periodSolved.total : 0;
        if (bVal !== aVal) {
          return bVal - aVal;
        }
        const aHard = a.periodSolved ? a.periodSolved.hard : 0;
        const bHard = b.periodSolved ? b.periodSolved.hard : 0;
        if (bHard !== aHard) {
          return bHard - aHard;
        }
        return (b.totalSolved || 0) - (a.totalSolved || 0);
      });
    } else {
      board.sort((a, b) => {
        if ((b.totalSolved || 0) !== (a.totalSolved || 0)) {
          return (b.totalSolved || 0) - (a.totalSolved || 0);
        }
        return (b.hardSolved || 0) - (a.hardSolved || 0);
      });
    }

    // Set ranks
    board.forEach((u, i) => {
      u.rank = i + 1;
    });

    res.json({ success: true, data: board });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/feed ────────────────────────────────────────────────────────────
const getActivityFeed = async (req, res) => {
  try {
    const owner = req.user.email;
    const limitVal = parseInt(req.query.limit) || 30;

    // Query submissions owned by this email
    const submissions = await Submission.find({ owner })
      .sort({ timestamp: -1 })
      .limit(limitVal);

    res.json({ success: true, count: submissions.length, data: submissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/users/report ────────────────────────────────────────────────────
const exportReport = async (req, res) => {
  try {
    const owner = req.user.email;
    const { startDate, endDate } = req.query;

    const users = await User.find({ owner, isActive: true });

    // Calculate period statistics if requested
    const periodSolvedMap = {};
    const hasPeriod = !!(startDate && endDate);

    if (hasPeriod) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Query submissions for this owner within the date range directly
      const submissions = await Submission.find({
        owner,
        timestamp: { $gte: start, $lte: end }
      });
      
      submissions.forEach(sub => {
        const uName = sub.username.toLowerCase();
        if (!periodSolvedMap[uName]) {
          periodSolvedMap[uName] = { total: 0, easy: 0, medium: 0, hard: 0 };
        }
        periodSolvedMap[uName].total++;
        const diff = sub.difficulty;
        if (diff === 'Easy') periodSolvedMap[uName].easy++;
        else if (diff === 'Medium') periodSolvedMap[uName].medium++;
        else if (diff === 'Hard') periodSolvedMap[uName].hard++;
      });
    }

    // Sort users by total solved (or period solved if active) to assign rank
    const sortedUsers = [...users];
    if (hasPeriod) {
      sortedUsers.sort((a, b) => {
        const aVal = periodSolvedMap[a.username.toLowerCase()]?.total || 0;
        const bVal = periodSolvedMap[b.username.toLowerCase()]?.total || 0;
        if (bVal !== aVal) return bVal - aVal;
        return (b.totalSolved || 0) - (a.totalSolved || 0);
      });
    } else {
      sortedUsers.sort((a, b) => (b.totalSolved || 0) - (a.totalSolved || 0));
    }

    // Generate CSV contents
    const headers = [
      'Rank',
      'Username',
      'Display Name',
      'LeetCode Global Rank',
      'Total Solved',
      'Easy Solved',
      'Medium Solved',
      'Hard Solved',
      'Period Solved Total',
      'Period Solved Easy',
      'Period Solved Medium',
      'Period Solved Hard',
      'Active Badge',
      'Contest Count',
      'Contest Rating',
      'Contest Global Rank',
      'Contest Top Percent',
      'Last Synced'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    };

    const csvRows = [headers.join(',')];

    sortedUsers.forEach((u, i) => {
      const uNameLower = u.username.toLowerCase();
      const period = periodSolvedMap[uNameLower] || { total: 0, easy: 0, medium: 0, hard: 0 };
      
      const row = [
        i + 1,
        escapeCsv(u.username),
        escapeCsv(u.displayName || u.username),
        escapeCsv(u.ranking || ""),
        escapeCsv(u.totalSolved || 0),
        escapeCsv(u.easySolved || 0),
        escapeCsv(u.mediumSolved || 0),
        escapeCsv(u.hardSolved || 0),
        hasPeriod ? escapeCsv(period.total) : "",
        hasPeriod ? escapeCsv(period.easy) : "",
        hasPeriod ? escapeCsv(period.medium) : "",
        hasPeriod ? escapeCsv(period.hard) : "",
        escapeCsv(u.activeBadge?.name || ""),
        escapeCsv(u.contestCount || 0),
        escapeCsv(u.contestRating || ""),
        escapeCsv(u.contestGlobalRanking || ""),
        escapeCsv(u.contestTopPercent !== null && u.contestTopPercent !== undefined ? `${u.contestTopPercent.toFixed(2)}%` : ""),
        escapeCsv(u.lastSynced ? new Date(u.lastSynced).toLocaleString() : "")
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = '\ufeff' + csvRows.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=leetcode_report.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/auth/credentials ────────────────────────────────────────────────
const getCredentials = async (req, res) => {
  try {
    const owner = req.user.email;
    const account = await Account.findOne({ email: owner.toLowerCase() });
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }
    res.json({
      success: true,
      hasSession: !!account.leetcodeSession,
      hasCsrfToken: !!account.leetcodeCsrfToken,
      leetcodeSession: account.leetcodeSession || '',
      leetcodeCsrfToken: account.leetcodeCsrfToken || ''
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/auth/credentials ───────────────────────────────────────────────
const saveCredentials = async (req, res) => {
  try {
    const owner = req.user.email;
    const { leetcodeSession, leetcodeCsrfToken } = req.body;

    await Account.updateOne(
      { email: owner.toLowerCase() },
      {
        $set: {
          leetcodeSession: leetcodeSession ? leetcodeSession.trim() : null,
          leetcodeCsrfToken: leetcodeCsrfToken ? leetcodeCsrfToken.trim() : null
        }
      }
    );

    res.json({ success: true, message: 'LeetCode credentials saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/submissions/:submissionId/code ─────────────────────────────────
const getSubmissionCode = async (req, res) => {
  try {
    const owner = req.user.email;
    const { submissionId } = req.params;
    const { username } = req.query;

    if (!submissionId || !username) {
      return res.status(400).json({ success: false, error: 'submissionId and username are required.' });
    }

    const sub = await Submission.findOne({ owner, username: username.toLowerCase(), submissionId });
    if (!sub) {
      return res.status(404).json({ success: false, error: 'Submission record not found.' });
    }

    if (sub.code) {
      return res.json({ success: true, code: sub.code });
    }

    // Load credentials for this owner
    const credentials = await getOwnerCredentials(owner);
    if (!credentials.leetcodeSession) {
      return res.status(400).json({
        success: false,
        error: 'LeetCode credentials not configured. Please save your session cookie in LeetCode Settings.'
      });
    }

    const code = await fetchSubmissionCode(submissionId, credentials);
    if (!code) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch code from LeetCode. Your session may be invalid or expired.'
      });
    }

    // Cache the fetched code in MongoDB
    await Submission.updateOne({ owner, username: username.toLowerCase(), submissionId }, { $set: { code } });

    res.json({ success: true, code });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getAllUsers,
  addUser,
  removeUser,
  getUserDetail,
  getUserSubmissions,
  syncAllUsers,
  getLeaderboard,
  getActivityFeed,
  exportReport,
  getCredentials,
  saveCredentials,
  getSubmissionCode
};
