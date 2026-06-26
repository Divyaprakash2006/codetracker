const { db } = require('../config/firebase');
const { doc, getDoc } = require('firebase/firestore');

const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const sessionRef = doc(db, 'sessions', token);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid session' });
    }

    const session = sessionSnap.data();

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Session expired' });
    }

    req.user = { email: session.email };
    next();
  } catch (err) {
    console.error('❌ Custom token verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

module.exports = checkAuth;
