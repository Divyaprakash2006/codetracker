const cron = require('node-cron');
const { db } = require('../config/firebase');
const {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  writeBatch
} = require('firebase/firestore');
const { fetchUserProfile, fetchRecentSubmissions } = require('../services/leetcodeService');

let isRunning = false;

const syncUser = async (username, owner) => {
  try {
    const docId = `${owner}_${username}`;
    // 1. Fetch fresh data from LeetCode GraphQL
    const profile     = await fetchUserProfile(username);
    const submissions = await fetchRecentSubmissions(username);

    // 2. Update user profile (upsert-style replace)
    const userRef = doc(db, 'users', docId);
    await setDoc(userRef, {
      ...profile,
      lastSynced: new Date().toISOString(),
      syncError: null
    }, { merge: true });

    // 3. Keep old submissions (don't clear them) to accumulate history for period stats.
    // Each submission is unique by document ID (owner_username_submissionId), so duplicates are avoided.
    /*
    const subQ = query(
      collection(db, 'submissions'),
      where('username', '==', username),
      where('owner', '==', owner)
    );
    const subSnap = await getDocs(subQ);
    if (!subSnap.empty) {
      const deleteBatch = writeBatch(db);
      subSnap.forEach(d => deleteBatch.delete(d.ref));
      await deleteBatch.commit();
    }
    */

    if (submissions.length > 0) {
      const insertBatch = writeBatch(db);
      submissions.forEach(sub => {
        const subId = `${owner}_${username}_${sub.submissionId}`;
        const subRef = doc(db, 'submissions', subId);
        insertBatch.set(subRef, {
          ...sub,
          username,
          owner,
          timestamp: sub.timestamp instanceof Date ? sub.timestamp.toISOString() : sub.timestamp
        });
      });
      await insertBatch.commit();
    }

    console.log(
      `🔄 Synced: ${username} (Owner: ${owner}) | Solved: ${profile.totalSolved} | ` +
      `Submissions cleared & reloaded: ${submissions.length}`
    );
  } catch (err) {
    console.error(`❌ Sync failed for ${username} (Owner: ${owner}): ${err.message}`);
    const docId = `${owner}_${username}`;
    const userRef = doc(db, 'users', docId);
    await setDoc(userRef, {
      syncError: err.message,
      lastSynced: new Date().toISOString()
    }, { merge: true }).catch(dbErr => {
      console.error(`❌ Firestore update failed for ${username}: ${dbErr.message}`);
    });
  }
};

const startSyncJob = () => {
  // Run every 2 minutes
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
      const q = query(collection(db, 'users'), where('isActive', '==', true));
      const snap = await getDocs(q);
      const users = [];
      snap.forEach(doc => {
        users.push(doc.data());
      });

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
        // Increased delay between requests to avoid 429 rate limiting
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
