const { db } = require('../config/firebase');
const {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} = require('firebase/firestore');
const { fetchUserProfile, fetchRecentSubmissions, validateUser, fetchSubmissionCode } = require('../services/leetcodeService');

const getOwnerCredentials = async (email) => {
  try {
    const accountRef = doc(db, 'accounts', email.toLowerCase());
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      const data = accountSnap.data();
      return {
        leetcodeSession: data.leetcodeSession || null,
        leetcodeCsrfToken: data.leetcodeCsrfToken || null
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
    const q = query(
      collection(db, 'users'),
      where('owner', '==', owner),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    const users = [];
    snap.forEach(doc => {
      users.push(doc.data());
    });
    // Sort in memory to avoid index requirements
    users.sort((a, b) => (b.totalSolved || 0) - (a.totalSolved || 0));
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
    const docId = `${owner}_${clean}`;

    // Check if already tracked by this owner
    const userRef = doc(db, 'users', docId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
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
      addedAt: new Date().toISOString(),
      lastSynced: new Date().toISOString(),
      syncError: null
    };

    await setDoc(userRef, userData);

    // Fetch and store submissions
    const submissions = await fetchRecentSubmissions(clean, 20, credentials);
    if (submissions.length > 0) {
      const batch = writeBatch(db);
      submissions.forEach(sub => {
        const subId = `${owner}_${clean}_${sub.submissionId}`;
        const subDocRef = doc(db, 'submissions', subId);
        batch.set(subDocRef, {
          ...sub,
          username: clean,
          owner,
          timestamp: sub.timestamp instanceof Date ? sub.timestamp.toISOString() : sub.timestamp
        });
      });
      await batch.commit();
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
    const docId = `${owner}_${username}`;

    const userRef = doc(db, 'users', docId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ success: false, error: `User "${username}" not found.` });
    }
    await deleteDoc(userRef);

    // Delete all submissions for this user & owner
    const q = query(
      collection(db, 'submissions'),
      where('owner', '==', owner),
      where('username', '==', username)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

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
    const docId = `${owner}_${username}`;

    const userRef = doc(db, 'users', docId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ success: false, error: 'User not found in tracker.' });
    }
    const userData = userSnap.data();

    // Get submissions for user & owner
    const q = query(
      collection(db, 'submissions'),
      where('owner', '==', owner),
      where('username', '==', username)
    );
    const snap = await getDocs(q);
    const submissions = [];
    snap.forEach(doc => {
      submissions.push(doc.data());
    });
    // Sort in memory
    submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedSubmissions = submissions.slice(0, 20);

    res.json({ success: true, data: { ...userData, submissions: limitedSubmissions } });
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

    const q = query(
      collection(db, 'submissions'),
      where('owner', '==', owner),
      where('username', '==', username)
    );
    const snap = await getDocs(q);
    const submissions = [];
    snap.forEach(doc => {
      submissions.push(doc.data());
    });
    // Sort in memory
    submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedSubmissions = submissions.slice(0, limitVal);

    res.json({ success: true, count: limitedSubmissions.length, data: limitedSubmissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/users/sync ─────────────────────────────────────────────────────
const syncAllUsers = async (req, res) => {
  try {
    const owner = req.user.email;
    const q = query(
      collection(db, 'users'),
      where('owner', '==', owner),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return res.json({ success: true, message: 'No users to sync.', synced: 0, report: [] });
    }

    const report = [];
    const users = [];
    snap.forEach(doc => {
      users.push(doc.data());
    });

    // Load credentials for this owner
    const credentials = await getOwnerCredentials(owner);

    // Process sequentially to avoid rate-limiting LeetCode GraphQL
    for (const u of users) {
      try {
        // 1. Fetch fresh data from LeetCode GraphQL
        const profile     = await fetchUserProfile(u.username, credentials);
        const submissions = await fetchRecentSubmissions(u.username, 20, credentials);

        // 2. Update user profile
        const docId = `${owner}_${u.username}`;
        const userRef = doc(db, 'users', docId);
        const updatedUser = {
          ...profile,
          lastSynced: new Date().toISOString(),
          syncError: null
        };
        await setDoc(userRef, updatedUser, { merge: true });

        // 3. Keep old submissions (don't clear them) to accumulate history for period stats.
        // Each submission is unique by document ID (owner_username_submissionId), so duplicates are avoided.
        /*
        const subQ = query(
          collection(db, 'submissions'),
          where('owner', '==', owner),
          where('username', '==', u.username)
        );
        const subSnap = await getDocs(subQ);
        if (!subSnap.empty) {
          const deleteBatch = writeBatch(db);
          subSnap.forEach(d => deleteBatch.delete(d.ref));
          await deleteBatch.commit();
        }
        */

        // 4. Insert fresh submissions
        if (submissions.length > 0) {
          const insertBatch = writeBatch(db);
          submissions.forEach(sub => {
            const subId = `${owner}_${u.username}_${sub.submissionId}`;
            const subRef = doc(db, 'submissions', subId);
            insertBatch.set(subRef, {
              ...sub,
              username: u.username,
              owner,
              timestamp: sub.timestamp instanceof Date ? sub.timestamp.toISOString() : sub.timestamp
            });
          });
          await insertBatch.commit();
        }

        report.push({
          username: u.username,
          status:   'synced',
          solved:   profile.totalSolved,
          submissions: submissions.length,
        });
      } catch (err) {
        const docId = `${owner}_${u.username}`;
        const userRef = doc(db, 'users', docId);
        await setDoc(userRef, {
          syncError: err.message,
          lastSynced: new Date().toISOString()
        }, { merge: true });
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

    const q = query(
      collection(db, 'users'),
      where('owner', '==', owner),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    const users = [];
    snap.forEach(doc => {
      users.push(doc.data());
    });

    // Calculate period statistics if requested
    const periodSolvedMap = {};
    const hasPeriod = !!(startDate && endDate);

    if (hasPeriod) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Query all submissions for this owner and filter in memory to avoid custom indexes
      const subQ = query(
        collection(db, 'submissions'),
        where('owner', '==', owner)
      );
      const subSnap = await getDocs(subQ);
      subSnap.forEach(doc => {
        const sub = doc.data();
        const subTime = new Date(sub.timestamp);
        if (subTime >= start && subTime <= end) {
          const uName = sub.username.toLowerCase();
          if (!periodSolvedMap[uName]) {
            periodSolvedMap[uName] = { total: 0, easy: 0, medium: 0, hard: 0 };
          }
          periodSolvedMap[uName].total++;
          const diff = sub.difficulty;
          if (diff === 'Easy') periodSolvedMap[uName].easy++;
          else if (diff === 'Medium') periodSolvedMap[uName].medium++;
          else if (diff === 'Hard') periodSolvedMap[uName].hard++;
        }
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
    const q = query(collection(db, 'submissions'), where('owner', '==', owner));
    const snap = await getDocs(q);
    const submissions = [];
    snap.forEach(doc => {
      submissions.push(doc.data());
    });
    // Sort in memory to avoid index requirements
    submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedSubmissions = submissions.slice(0, limitVal);

    res.json({ success: true, count: limitedSubmissions.length, data: limitedSubmissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/users/report ────────────────────────────────────────────────────
const exportReport = async (req, res) => {
  try {
    const owner = req.user.email;
    const { startDate, endDate } = req.query;

    const q = query(
      collection(db, 'users'),
      where('owner', '==', owner),
      where('isActive', '==', true)
    );
    const snap = await getDocs(q);
    const users = [];
    snap.forEach(doc => {
      users.push(doc.data());
    });

    // Calculate period statistics if requested
    const periodSolvedMap = {};
    const hasPeriod = !!(startDate && endDate);

    if (hasPeriod) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Query all submissions for this owner and filter in memory to avoid custom indexes
      const subQ = query(
        collection(db, 'submissions'),
        where('owner', '==', owner)
      );
      const subSnap = await getDocs(subQ);
      subSnap.forEach(doc => {
        const sub = doc.data();
        const subTime = new Date(sub.timestamp);
        if (subTime >= start && subTime <= end) {
          const uName = sub.username.toLowerCase();
          if (!periodSolvedMap[uName]) {
            periodSolvedMap[uName] = { total: 0, easy: 0, medium: 0, hard: 0 };
          }
          periodSolvedMap[uName].total++;
          const diff = sub.difficulty;
          if (diff === 'Easy') periodSolvedMap[uName].easy++;
          else if (diff === 'Medium') periodSolvedMap[uName].medium++;
          else if (diff === 'Hard') periodSolvedMap[uName].hard++;
        }
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
    const accountRef = doc(db, 'accounts', owner.toLowerCase());
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }
    const data = accountSnap.data();
    res.json({
      success: true,
      hasSession: !!data.leetcodeSession,
      hasCsrfToken: !!data.leetcodeCsrfToken,
      leetcodeSession: data.leetcodeSession || '',
      leetcodeCsrfToken: data.leetcodeCsrfToken || ''
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

    const accountRef = doc(db, 'accounts', owner.toLowerCase());
    await setDoc(accountRef, {
      leetcodeSession: leetcodeSession ? leetcodeSession.trim() : null,
      leetcodeCsrfToken: leetcodeCsrfToken ? leetcodeCsrfToken.trim() : null
    }, { merge: true });

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

    const docId = `${owner}_${username.toLowerCase()}_${submissionId}`;
    const subRef = doc(db, 'submissions', docId);
    const subSnap = await getDoc(subRef);

    if (!subSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Submission record not found.' });
    }

    const subData = subSnap.data();
    if (subData.code) {
      return res.json({ success: true, code: subData.code });
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

    // Cache the fetched code in Firestore
    await setDoc(subRef, { code }, { merge: true });

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
