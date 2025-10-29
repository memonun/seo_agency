// Vercel Serverless Function for Domain Analytics
// Provides comprehensive domain analysis using DataForSEO APIs

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { 
    domainPattern, 
    limit = 10, 
    filterType = 'all', 
    customFilters = null,
    user_id,
    session_id 
  } = req.body

  if (!domainPattern) {
    return res.status(400).json({ error: 'Domain pattern is required' })
  }

  try {
    console.log(`🔍 Domain Analytics Request: ${domainPattern} (${filterType}, limit: ${limit})`)

    // Get DataForSEO credentials from environment
    const DATAFORSEO_LOGIN = process.env.VITE_DATAFORSEO_LOGIN
    const DATAFORSEO_PASSWORD = process.env.VITE_DATAFORSEO_PASSWORD

    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      throw new Error('DataForSEO credentials not configured')
    }

    // Create auth header
    const credentials = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64')
    const authHeader = `Basic ${credentials}`

    // Step 1: PRIMARY - Get domain analytics (WHOIS overview)
    const primaryResults = await getDomainAnalytics({
      domainPattern,
      limit: parseInt(limit),
      filterType,
      customFilters,
      authHeader
    })

    // Step 2: ENHANCED - Get additional data for comprehensive analysis
    const domain = domainPattern
    const cleanDomain = sanitizeDomainForBulkTraffic(domain)

    console.log(`🚀 Starting enhanced analysis for: ${domain}`)

    const [
      bulkTrafficResponse,
      competitorsResponse,
      relevantPagesResponse,
      backlinksResponse,
      domainMetricsResponse
    ] = await Promise.allSettled([
      // Use sanitized domain for bulk traffic API (skip if invalid)
      cleanDomain.length > 0 ? getBulkTrafficEstimation({
        targets: [cleanDomain],
        authHeader
      }) : Promise.reject(new Error('Invalid domain after sanitization')),
      getCompetitorsDomain({
        target: domain,
        authHeader
      }),
      getRelevantPages({
        target: domain,
        authHeader
      }),
      getBacklinksSummary({
        target: domain,
        authHeader
      }),
      getKeywordsForSite({
        target: domain,
        authHeader
      })
    ])

    // Format primary results
    const formattedPrimary = formatDomainResults(primaryResults)

    // Build enhanced data object
    const enhancedData = {
      domain: domain,
      trafficEstimation: bulkTrafficResponse.status === 'fulfilled' ? formatBulkTrafficResults(bulkTrafficResponse.value) : [],
      competitors: competitorsResponse.status === 'fulfilled' ? formatCompetitorsResults(competitorsResponse.value) : [],
      relevantPages: relevantPagesResponse.status === 'fulfilled' ? formatRelevantPagesResults(relevantPagesResponse.value) : [],
      backlinks: backlinksResponse.status === 'fulfilled' ? formatBacklinksResults(backlinksResponse.value) : {},
      domainMetrics: domainMetricsResponse.status === 'fulfilled' ? formatKeywordsForSiteResults(domainMetricsResponse.value) : [],
      endpointStatus: {
        bulkTraffic: bulkTrafficResponse.status,
        competitors: competitorsResponse.status,
        relevantPages: relevantPagesResponse.status,
        backlinks: backlinksResponse.status,
        domainMetrics: domainMetricsResponse.status
      },
      errors: {
        bulkTraffic: bulkTrafficResponse.status === 'rejected' ? bulkTrafficResponse.reason?.message : null,
        competitors: competitorsResponse.status === 'rejected' ? competitorsResponse.reason?.message : null,
        relevantPages: relevantPagesResponse.status === 'rejected' ? relevantPagesResponse.reason?.message : null,
        backlinks: backlinksResponse.status === 'rejected' ? backlinksResponse.reason?.message : null,
        domainMetrics: domainMetricsResponse.status === 'rejected' ? domainMetricsResponse.reason?.message : null
      }
    }

    // Count successful endpoints and total data points
    const successfulEndpoints = 1 + Object.values(enhancedData.endpointStatus).filter(status => status === 'fulfilled').length
    const totalDataPoints = (
      formattedPrimary.length +
      enhancedData.trafficEstimation.length +
      enhancedData.competitors.length +
      enhancedData.relevantPages.length +
      (Object.keys(enhancedData.backlinks).length > 0 ? 1 : 0) +
      enhancedData.domainMetrics.length
    )

    console.log(`✅ Domain analysis complete: ${successfulEndpoints}/5 endpoints successful, ${totalDataPoints} data points`)

    // Return comprehensive results
    return res.status(200).json({
      success: true,
      results: {
        primary: formattedPrimary,
        enhanced: enhancedData
      },
      meta: {
        endpointsSuccessful: successfulEndpoints,
        totalEndpoints: 5,
        totalDataPoints,
        domain,
        cleanDomain,
        filterType,
        limit: parseInt(limit)
      }
    })

  } catch (error) {
    console.error('❌ Domain Analytics Error:', error)
    return res.status(500).json({ 
      error: error.message || 'Failed to retrieve domain analytics',
      details: error.stack
    })
  }
}

/**
 * Sanitize domain input for bulk traffic estimation API
 */
function sanitizeDomainForBulkTraffic(domainInput) {
  if (!domainInput || typeof domainInput !== 'string') {
    return ''
  }

  let cleanDomain = domainInput.trim()

  // Remove wildcards (%) that work in WHOIS API but not bulk traffic API
  cleanDomain = cleanDomain.replace(/%/g, '')

  // Remove protocols
  cleanDomain = cleanDomain.replace(/^https?:\/\//, '')
  cleanDomain = cleanDomain.replace(/^ftp:\/\//, '')

  // Remove www. prefix if present
  cleanDomain = cleanDomain.replace(/^www\./, '')

  // Remove trailing slashes and paths
  cleanDomain = cleanDomain.split('/')[0]
  cleanDomain = cleanDomain.split('?')[0]
  cleanDomain = cleanDomain.split('#')[0]

  // Remove port numbers
  cleanDomain = cleanDomain.split(':')[0]

  // Basic domain validation - should contain at least one dot
  if (!cleanDomain.includes('.') || cleanDomain.length < 3) {
    return ''
  }

  return cleanDomain
}

/**
 * Call DataForSEO Domain Analytics WHOIS Overview API
 */
async function getDomainAnalytics({
  domainPattern,
  limit = 10,
  filterType = 'all',
  customFilters = null,
  authHeader
}) {
  // Build filters based on filter type
  let filters = []

  if (filterType === 'expiring') {
    // Domains expiring in next 90 days
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 90)
    filters = [
      ["expiration_datetime", "<", futureDate.toISOString().split('.')[0] + " +00:00"],
      "and",
      ["domain", "like", domainPattern]
    ]
  } else if (filterType === 'high_traffic') {
    // Domains with high organic traffic
    filters = [
      ["domain", "like", domainPattern],
      "and",
      ["metrics.organic.etv", ">", 1000]
    ]
  } else if (filterType === 'high_backlinks') {
    // Domains with high backlinks
    filters = [
      ["domain", "like", domainPattern],
      "and",
      ["backlinks_info.referring_domains", ">", 100]
    ]
  } else if (filterType === 'custom' && customFilters) {
    // Use custom filters provided
    filters = customFilters
  } else {
    // Default: just domain pattern
    filters = [["domain", "like", domainPattern]]
  }

  const requestBody = [
    {
      limit: limit,
      filters: filters,
      order_by: ["metrics.organic.etv,desc"]
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/domain_analytics/whois/overview/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  // Check for API-level errors
  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

/**
 * Call DataForSEO Bulk Traffic Estimation API
 */
async function getBulkTrafficEstimation({
  targets,
  languageCode = 'en',
  locationCode = 2840,
  authHeader
}) {
  const requestBody = [
    {
      targets,
      language_code: languageCode,
      location_code: locationCode
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_traffic_estimation/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

/**
 * Call DataForSEO Competitors Domain API
 */
async function getCompetitorsDomain({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100,
  authHeader
}) {
  const requestBody = [
    {
      target,
      language_code: languageCode,
      location_code: locationCode,
      limit
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

/**
 * Call DataForSEO Relevant Pages API
 */
async function getRelevantPages({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100,
  authHeader
}) {
  const requestBody = [
    {
      target,
      language_code: languageCode,
      location_code: locationCode,
      limit
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/relevant_pages/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

/**
 * Call DataForSEO Backlinks Summary API
 */
async function getBacklinksSummary({
  target,
  filters = null,
  authHeader
}) {
  const requestBody = [
    {
      target,
      ...(filters && { filters })
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

/**
 * Call DataForSEO Keywords For Site API
 */
async function getKeywordsForSite({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100,
  authHeader
}) {
  const requestBody = [
    {
      target,
      language_code: languageCode,
      location_code: locationCode,
      limit,
      order_by: ["search_volume,desc"]
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keywords_for_site/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

/**
 * Format domain analytics results
 */
function formatDomainResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result[0]

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    domain: item.domain,
    created: item.created_datetime,
    expires: item.expiration_datetime,
    updated: item.updated_datetime,
    firstSeen: item.first_seen,
    backlinks: {
      total: item.backlinks_info?.backlinks || 0,
      referringDomains: item.backlinks_info?.referring_domains || 0,
      referringIps: item.backlinks_info?.referring_ips || 0
    },
    organic: {
      pos1: item.metrics?.organic?.pos_1 || 0,
      pos2_3: item.metrics?.organic?.pos_2_3 || 0,
      pos4_10: item.metrics?.organic?.pos_4_10 || 0,
      pos11_20: item.metrics?.organic?.pos_11_20 || 0,
      etv: item.metrics?.organic?.etv || 0,
      count: item.metrics?.organic?.count || 0
    },
    paid: {
      pos1: item.metrics?.paid?.pos_1 || 0,
      pos2_3: item.metrics?.paid?.pos_2_3 || 0,
      pos4_10: item.metrics?.paid?.pos_4_10 || 0,
      etv: item.metrics?.paid?.etv || 0,
      count: item.metrics?.paid?.count || 0
    }
  }))
}

/**
 * Format bulk traffic estimation results
 */
function formatBulkTrafficResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    target: item.target,
    trafficEstimation: {
      organicEtv: item.metrics?.organic?.etv || 0,
      organicTraffic: item.metrics?.organic?.count || 0,
      organicClicks: item.metrics?.organic?.estimated_paid_traffic_cost || 0,
      monthlyVisits: item.metrics?.organic?.estimated_paid_traffic_cost || 0,
      monthlyClicks: item.metrics?.organic?.count || 0,
      paidEtv: item.metrics?.paid?.etv || 0
    }
  }))
}

/**
 * Format competitors results
 */
function formatCompetitorsResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    domain: item.domain,
    avgPosition: item.avg_position,
    overlapScore: item.metrics?.intersections_count || 0,
    intersections: item.metrics?.intersections_count || 0,
    fullDomainMetrics: {
      organicKeywords: item.full_domain_metrics?.organic?.count || 0,
      organicCost: item.full_domain_metrics?.organic?.etv || 0
    }
  }))
}

/**
 * Format relevant pages results
 */
function formatRelevantPagesResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    page: item.page,
    title: item.page_title || 'N/A',
    metrics: {
      organicKeywords: item.metrics?.organic?.count || 0,
      organicTraffic: item.metrics?.organic?.count || 0,
      organicCost: item.metrics?.organic?.etv || 0
    }
  }))
}

/**
 * Format backlinks results
 */
function formatBacklinksResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return {}
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items || results.items.length === 0) {
    return {}
  }

  const item = results.items[0]

  return {
    totalBacklinks: item.backlinks || 0,
    totalReferringDomains: item.referring_domains || 0,
    authorityScore: item.rank || 0,
    trustFlow: item.trust || 0,
    backlinkGrowth: {
      monthlyGrowth: item.new_backlinks || 0
    }
  }
}

/**
 * Format keywords for site results
 */
function formatKeywordsForSiteResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    keyword: item.keyword_data?.keyword || '',
    searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
    cpc: item.keyword_data?.keyword_info?.cpc || 0,
    competitionLevel: item.keyword_data?.keyword_info?.competition || 'N/A',
    searchIntent: item.keyword_data?.search_intent_info?.main_intent || 'N/A',
    detectedLanguage: item.keyword_data?.language_code || 'en',
    difficulty: item.keyword_data?.keyword_info?.difficulty || 0
  }))
}