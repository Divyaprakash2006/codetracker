const { db } = require('../config/firebase');
const { doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');
const crypto = require('crypto');

// Password hashing helper
const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
};

// ─── POST /api/auth/register ────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    // Check if account already exists
    const accountRef = doc(db, 'accounts', cleanEmail);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      return res.status(409).json({ success: false, error: 'Account already exists.' });
    }

    // Hash password
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    // Save account
    await setDoc(accountRef, {
      email: cleanEmail,
      passwordHash,
      salt,
      createdAt: new Date().toISOString()
    });

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const sessionRef = doc(db, 'sessions', token);

    await setDoc(sessionRef, {
      token,
      email: cleanEmail,
      createdAt: new Date().toISOString(),
      expiresAt
    });

    res.status(201).json({ success: true, token, email: cleanEmail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/auth/login ───────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Get account
    const accountRef = doc(db, 'accounts', cleanEmail);
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const account = accountSnap.data();
    const hash = hashPassword(password, account.salt);
    if (hash !== account.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const sessionRef = doc(db, 'sessions', token);

    await setDoc(sessionRef, {
      token,
      email: cleanEmail,
      createdAt: new Date().toISOString(),
      expiresAt
    });

    res.json({ success: true, token, email: cleanEmail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const sessionRef = doc(db, 'sessions', token);
      await deleteDoc(sessionRef);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  register,
  login,
  logout
};
