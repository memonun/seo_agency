// Quick test script to debug server issues
import fetch from 'node-fetch';

const testData = {
  type: 'combined-search',
  keyword: 'test',
  hashtags: [],
  location: '',
  sortOrder: 'recent',
  includeMentions: false,
  global: false,
  limit: 5
};

console.log('🧪 Testing server with:', testData);

try {
  const response = await fetch('http://localhost:3001/api/twitter-analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testData)
  });
  
  console.log('Response status:', response.status);
  
  if (response.ok) {
    const data = await response.json();
    console.log('✅ Success:', data);
  } else {
    const errorText = await response.text();
    console.log('❌ Error response:', errorText);
  }
} catch (error) {
  console.error('❌ Network error:', error.message);
}