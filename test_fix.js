// Test the complete flow
async function testChannelSearch() {
  const RAPIDAPI_KEY = '553b90a274msh8d67b80de1ab290p190ecdjsn7d2cbbfb0589';
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com';
  
  console.log('🔍 Testing @Jynxzi channel search...');
  
  // Step 1: Search for channel
  const searchUrl = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent('@Jynxzi')}&type=channel`;
  const searchResponse = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  });
  
  if (!searchResponse.ok) {
    throw new Error(`Search failed: ${searchResponse.status}`);
  }
  
  const searchData = await searchResponse.json();
  console.log('✅ Search successful');
  
  if (!searchData.data || searchData.data.length === 0) {
    throw new Error('No channels found');
  }
  
  const channel = searchData.data[0];
  const channelId = channel.channelId;
  console.log(`✅ Found channel ID: ${channelId}`);
  
  // Step 2: Get videos
  const videosUrl = `https://${RAPIDAPI_HOST}/channel/videos?id=${encodeURIComponent(channelId)}`;
  const videosResponse = await fetch(videosUrl, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  });
  
  if (!videosResponse.ok) {
    throw new Error(`Videos failed: ${videosResponse.status}`);
  }
  
  const videosData = await videosResponse.json();
  console.log('✅ Videos retrieved successfully');
  console.log(`📹 Found ${videosData.data.length} videos`);
  console.log(`📹 First video: ${videosData.data[0].title}`);
  
  return videosData.data;
}

testChannelSearch().catch(console.error);