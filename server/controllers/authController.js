const Account = require('../models/Account.model');
const Session = require('../models/Session.model');
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
    const accountExists = await Account.findOne({ email: cleanEmail });
    if (accountExists) {
      return res.status(409).json({ success: false, error: 'Account already exists.' });
    }

    // Hash password
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    // Save account
    const newAccount = new Account({
      email: cleanEmail,
      passwordHash,
      salt
    });
    await newAccount.save();

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newSession = new Session({
      token,
      email: cleanEmail,
      expiresAt
    });
    await newSession.save();

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
    const account = await Account.findOne({ email: cleanEmail });
    if (!account) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const hash = hashPassword(password, account.salt);
    if (hash !== account.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newSession = new Session({
      token,
      email: cleanEmail,
      expiresAt
    });
    await newSession.save();

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
      await Session.deleteOne({ token });
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
