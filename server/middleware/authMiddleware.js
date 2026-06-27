const Session = require('../models/Session.model');

const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const session = await Session.findOne({ token });

    if (!session) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid session' });
    }

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      // Clean up expired session asynchronously
      Session.deleteOne({ token }).catch(err => console.error('Error deleting expired session:', err.message));
      return res.status(401).json({ success: false, error: 'Unauthorized: Session expired' });
    }

    req.user = { email: session.email };
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

module.exports = checkAuth;
