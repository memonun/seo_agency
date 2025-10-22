// Debug script for YouTube functionality
import dotenv from 'dotenv'

dotenv.config()

console.log('🔍 Testing YouTube APIs...')
console.log('VITE_RAPIDAPI_KEY:', process.env.VITE_RAPIDAPI_KEY ? 'SET' : 'NOT SET')
console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? 'SET' : 'NOT SET')

async function testTranscriptAPI() {
  console.log('\n📝 Testing Transcript API...')
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const videoId = 'LOH1l-MP_9k'
  
  try {
    const url = `https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${videoId}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Host': 'youtube-transcript3.p.rapidapi.com',
        'X-RapidAPI-Key': RAPIDAPI_KEY
      }
    })

    if (!response.ok) {
      throw new Error(`Transcript API failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.transcript || !Array.isArray(data.transcript) || data.transcript.length === 0) {
      throw new Error('No valid transcript found')
    }

    console.log('✅ Transcript API working - got', data.transcript.length, 'segments')
    return data.transcript
  } catch (error) {
    console.error('❌ Transcript API error:', error.message)
    return null
  }
}

async function testCommentsAPI() {
  console.log('\n💬 Testing Comments API...')
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const videoId = 'LOH1l-MP_9k'
  
  try {
    const url = `https://youtube-v31.p.rapidapi.com/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Host': 'youtube-v31.p.rapidapi.com',
        'X-RapidAPI-Key': RAPIDAPI_KEY
      }
    })

    if (!response.ok) {
      throw new Error(`Comments API failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('No valid comments found')
    }

    const comments = {
      totalCount: data.pageInfo?.totalResults || data.items.length,
      items: data.items.map(item => {
        const snippet = item.snippet?.topLevelComment?.snippet
        return {
          id: item.id,
          authorDisplayName: snippet?.authorDisplayName || 'Unknown',
          textDisplay: snippet?.textDisplay || '',
          likeCount: snippet?.likeCount || 0,
          publishedAt: snippet?.publishedAt || ''
        }
      })
    }

    console.log('✅ Comments API working - got', comments.items.length, 'comments')
    return comments
  } catch (error) {
    console.error('❌ Comments API error:', error.message)
    return null
  }
}

async function testAISummarization() {
  console.log('\n🤖 Testing AI Summarization...')
  
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  
  if (!OPENROUTER_API_KEY) {
    console.error('❌ OpenRouter API key not found')
    return null
  }

  try {
    const mockTranscript = [
      { text: "This is a test video about React hooks", offset: 0, timestamp: "0:00" },
      { text: "We will learn about useState and useEffect", offset: 5, timestamp: "0:05" }
    ]
    
    const mockComments = {
      totalCount: 2,
      items: [
        { authorDisplayName: "User1", textDisplay: "Great video!", likeCount: 5 },
        { authorDisplayName: "User2", textDisplay: "Very helpful explanation", likeCount: 3 }
      ]
    }

    const systemMessage = `You are a professional video content analyzer. Provide a brief summary with key points.`
    const userPrompt = `Analyze this test data: TRANSCRIPT: ${JSON.stringify(mockTranscript)} COMMENTS: ${JSON.stringify(mockComments)}`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API failed: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content || 'No summary available'

    console.log('✅ AI API working - summary:', summary.substring(0, 100) + '...')
    return summary
  } catch (error) {
    console.error('❌ AI API error:', error.message)
    return null
  }
}

async function runTests() {
  const transcript = await testTranscriptAPI()
  const comments = await testCommentsAPI()
  const summary = await testAISummarization()
  
  console.log('\n📊 Test Results:')
  console.log('Transcript:', transcript ? '✅ Working' : '❌ Failed')
  console.log('Comments:', comments ? '✅ Working' : '❌ Failed')
  console.log('AI Summary:', summary ? '✅ Working' : '❌ Failed')
}

runTests().catch(console.error)