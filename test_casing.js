const axios = require('axios');

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

const QUERY_USER_PROFILE = `
  query getUserProfile($username: String!) {
    matchedUser(username: $username) {
      username
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
    allQuestionsCount {
      difficulty
      count
    }
  }
`;

const run = async () => {
  try {
    const res = await axios.post(LEETCODE_GRAPHQL, {
      query: QUERY_USER_PROFILE,
      variables: { username: 'divyaprakash_123' }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://leetcode.com',
        'Referer': 'https://leetcode.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });
    console.log('--- acSubmissionNum ---');
    console.log(JSON.stringify(res.data.data.matchedUser.submitStatsGlobal.acSubmissionNum, null, 2));
    console.log('--- allQuestionsCount ---');
    console.log(JSON.stringify(res.data.data.allQuestionsCount, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
};

run();
