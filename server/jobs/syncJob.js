const cron = require('node-cron');
const Account = require('../models/Account.model');
const User = require('../models/User.model');
const Submission = require('../models/Submission.model');
const { fetchUserProfile, fetchRecentSubmissions } = require('../services/leetcodeService');

let isRunning = false;

const syncUser = async (username, owner) => {
  try {
    // Load credentials for this owner
    const account = await Account.findOne({ email: owner.toLowerCase() });
    const credentials = account ? {
      leetcodeSession: account.leetcodeSession || null,
      leetcodeCsrfToken: account.leetcodeCsrfToken || null
    } : {};

    // 1. Fetch fresh data from LeetCode GraphQL
    const profile     = await fetchUserProfile(username, credentials);
    const submissions = await fetchRecentSubmissions(username, 20, credentials);

    // 2. Update user profile
    await User.updateOne(
      { owner, username },
      {
        $set: {
          ...profile,
          lastSynced: new Date(),
          syncError: null
        }
      }
    );

    // 3. Insert fresh submissions using bulkWrite upserts
    if (submissions.length > 0) {
      const bulkOps = submissions.map(sub => ({
        updateOne: {
          filter: { owner, username, submissionId: sub.submissionId },
          update: {
            $set: {
              ...sub,
              username,
              owner,
              timestamp: sub.timestamp instanceof Date ? sub.timestamp : new Date(sub.timestamp)
            }
          },
          upsert: true
        }
      }));
      await Submission.bulkWrite(bulkOps);
    }

    console.log(
      `🔄 Synced: ${username} (Owner: ${owner}) | Solved: ${profile.totalSolved} | ` +
      `Submissions synced: ${submissions.length}`
    );
  } catch (err) {
    console.error(`❌ Sync failed for ${username} (Owner: ${owner}): ${err.message}`);
    await User.updateOne(
      { owner, username },
      {
        $set: {
          syncError: err.message,
          lastSynced: new Date()
        }
      }
    ).catch(dbErr => {
      console.error(`❌ DB update failed for ${username}: ${dbErr.message}`);
    });
  }
};

const startSyncJob = () => {
  // Run every 2 minutes or per config
  const interval = process.env.SYNC_INTERVAL_MINUTES || '2';
  const cronExpr = `*/${interval} * * * *`;

  cron.schedule(cronExpr, async () => {
    if (isRunning) {
      console.log('⚠️  Sync already running, skipping...');
      return;
    }

    isRunning = true;
    console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Starting auto-sync...`);

    try {
      const users = await User.find({ isActive: true });

      if (users.length === 0) {
        console.log('   No users to sync.');
        isRunning = false;
        return;
      }

      // Sync users sequentially to avoid rate limiting
      for (const user of users) {
        if (user.username && user.owner) {
          await syncUser(user.username, user.owner);
        }
        // Polite delay between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 3500));
      }

      console.log(`✅ Auto-sync complete for ${users.length} user(s).`);
    } catch (err) {
      console.error('❌ Sync job error:', err.message);
    } finally {
      isRunning = false;
    }
  });

  console.log(`⏰ Auto-sync job scheduled every ${interval} minute(s).`);
};

module.exports = { startSyncJob, syncUser };
