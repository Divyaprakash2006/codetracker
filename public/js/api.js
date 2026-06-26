// ─── API Client ────────────────────────────────────────────────────────────────
const BASE = '/api';

const request = async (method, path, body = null) => {
  const headers = { 'Content-Type': 'application/json' };

  const token = localStorage.getItem('auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const opts = {
    method,
    headers
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json;
};

window.API = {
  getUsers:         ()         => request('GET',  '/users'),
  addUser:          (username) => request('POST', '/users', { username }),
  removeUser:       (username) => request('DELETE',`/users/${username}`),
  getUserDetail:    (username) => request('GET',  `/users/${username}`),
  getUserSubs:      (username) => request('GET',  `/users/${username}/submissions`),
  syncAll:          ()         => request('POST', '/sync'),
  getCredentials:   ()         => request('GET',  '/auth/credentials'),
  saveCredentials:  (leetcodeSession, leetcodeCsrfToken) => request('POST', '/auth/credentials', { leetcodeSession, leetcodeCsrfToken }),
  getSubmissionCode: (submissionId, username) => request('GET', `/submissions/${submissionId}/code?username=${encodeURIComponent(username)}`),
  getLeaderboard:   (startDate, endDate, sortBy) => {
    let query = '';
    const params = [];
    if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
    if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
    if (sortBy) params.push(`sortBy=${encodeURIComponent(sortBy)}`);
    if (params.length > 0) {
      query = '?' + params.join('&');
    }
    return request('GET', `/leaderboard${query}`);
  },
  getFeed:          ()         => request('GET',  '/feed'),
  healthCheck:      ()         => request('GET',  '/health'),
};
