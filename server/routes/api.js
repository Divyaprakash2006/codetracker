const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/userController');
const { register, login, logout } = require('../controllers/authController');
const checkAuth = require('../middleware/authMiddleware');

// Auth
router.post('/auth/register',               register);
router.post('/auth/login',                  login);
router.post('/auth/logout',                 logout);
router.get('/auth/credentials',             checkAuth, getCredentials);
router.post('/auth/credentials',            checkAuth, saveCredentials);
router.get('/submissions/:submissionId/code', checkAuth, getSubmissionCode);

// User CRUD
router.get('/users',                        checkAuth, getAllUsers);
router.get('/users/report',                 checkAuth, exportReport);
router.post('/users',                       checkAuth, addUser);
router.delete('/users/:username',           checkAuth, removeUser);
router.get('/users/:username',              checkAuth, getUserDetail);
router.get('/users/:username/submissions',  checkAuth, getUserSubmissions);

// Sync
router.post('/sync',                        checkAuth, syncAllUsers);

// Leaderboard & Feed
router.get('/leaderboard',                  checkAuth, getLeaderboard);
router.get('/feed',                         checkAuth, getActivityFeed);

module.exports = router;
