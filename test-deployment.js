// Quick deployment test script
import https from 'https'
import { URL } from 'url'

// Test multiple endpoints to verify deployment health
const DOMAIN = 'seo-agency-memicos-projects.vercel.app' // Update with actual domain
const TEST_ENDPOINTS = [
  '/api/domain-analytics',
  '/api/youtube-channel-search',
  '/api/twitter-analytics'
]

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(`https://${DOMAIN}${endpoint}`)
    
    // Test with HEAD request to check if endpoint exists
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'HEAD',
      timeout: 10000
    }, (res) => {
      resolve({
        endpoint,
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: res.headers,
        success: res.statusCode < 500
      })
    })

    req.on('error', (error) => {
      resolve({
        endpoint,
        status: 'ERROR',
        error: error.message,
        success: false
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({
        endpoint,
        status: 'TIMEOUT',
        error: 'Request timeout',
        success: false
      })
    })

    req.end()
  })
}

async function testDeployment() {
  console.log(`🔍 Testing Vercel deployment: ${DOMAIN}`)
  console.log(`⏱️  Testing ${TEST_ENDPOINTS.length} endpoints...\n`)

  const results = []
  
  for (const endpoint of TEST_ENDPOINTS) {
    console.log(`Testing ${endpoint}...`)
    const result = await testEndpoint(endpoint)
    results.push(result)
    
    const statusIcon = result.success ? '✅' : '❌'
    console.log(`${statusIcon} ${endpoint}: ${result.status} ${result.statusText || result.error || ''}`)
  }

  console.log(`\n📊 Summary:`)
  const successCount = results.filter(r => r.success).length
  console.log(`✅ Successful: ${successCount}/${results.length}`)
  console.log(`❌ Failed: ${results.length - successCount}/${results.length}`)

  if (successCount === results.length) {
    console.log(`\n🎉 All endpoints are responding correctly!`)
    console.log(`🚀 Deployment appears to be successful.`)
  } else {
    console.log(`\n⚠️  Some endpoints may have issues.`)
    console.log(`🔧 Check Vercel deployment logs for details.`)
  }

  return results
}

// Run the test
testDeployment().catch(console.error)