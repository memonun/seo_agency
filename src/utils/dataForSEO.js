// DataForSEO API client utility
const DATAFORSEO_API_URL = 'https://api.dataforseo.com/v3'
const DATAFORSEO_LOGIN = import.meta.env.VITE_DATAFORSEO_LOGIN || ''
const DATAFORSEO_PASSWORD = import.meta.env.VITE_DATAFORSEO_PASSWORD || ''

/**
 * Create Basic Auth header for DataForSEO API
 */
const getAuthHeader = () => {
  const credentials = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`)
  return `Basic ${credentials}`
}

/**
 * Sanitize domain input for bulk traffic estimation API
 * Removes wildcards, protocols, and cleans to just domain name
 * @param {string} domainInput - Raw domain input from user
 * @returns {string} Clean domain name suitable for bulk traffic API
 */
export const sanitizeDomainForBulkTraffic = (domainInput) => {
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
 * @param {Object} params - API parameters
 * @param {string} params.domainPattern - Domain search pattern (e.g., "example.com", "%seo%")
 * @param {number} params.limit - Number of results (default: 10, max: 1000)
 * @param {string} params.filterType - Filter type (all, expiring, high_traffic, high_backlinks, custom)
 * @param {Array} params.customFilters - Custom filter array (optional)
 * @returns {Promise<Object>} API response
 */
export const getDomainAnalytics = async ({
  domainPattern,
  limit = 10,
  filterType = 'all',
  customFilters = null
}) => {
  try {
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

    const response = await fetch(`${DATAFORSEO_API_URL}/domain_analytics/whois/overview/live`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
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
  } catch (error) {
    console.error('DataForSEO API Error:', error)
    throw error
  }
}

/**
 * Parse and format domain analytics results
 * @param {Object} apiResponse - Raw API response from DataForSEO
 * @returns {Array} Formatted results array
 */
export const formatDomainResults = (apiResponse) => {
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
 * Call DataForSEO Bulk Traffic Estimation API
 * @param {Object} params - API parameters
 * @param {Array} params.targets - Array of target domains/URLs to analyze
 * @param {string} params.languageCode - Language code (default: "en")
 * @param {string} params.locationCode - Location code (default: 2840 for US)
 * @returns {Promise<Object>} API response
 */
export const getBulkTrafficEstimation = async ({
  targets,
  languageCode = 'en',
  locationCode = 2840
}) => {
  try {
    const requestBody = [
      {
        targets,
        language_code: languageCode,
        location_code: locationCode
      }
    ]


    const response = await fetch(`${DATAFORSEO_API_URL}/dataforseo_labs/google/bulk_traffic_estimation/live`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
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
  } catch (error) {
    console.error('DataForSEO Bulk Traffic Estimation API Error:', error)
    throw error
  }
}

/**
 * Call DataForSEO Competitors Domain API
 * @param {Object} params - API parameters
 * @param {string} params.target - Target domain to analyze
 * @param {string} params.languageCode - Language code (default: "en")
 * @param {string} params.locationCode - Location code (default: 2840 for US)
 * @param {number} params.limit - Number of results (default: 100)
 * @returns {Promise<Object>} API response
 */
export const getCompetitorsDomain = async ({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100
}) => {
  try {
    const requestBody = [
      {
        target,
        language_code: languageCode,
        location_code: locationCode,
        limit
      }
    ]

    const response = await fetch(`${DATAFORSEO_API_URL}/dataforseo_labs/google/competitors_domain/live`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
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
  } catch (error) {
    console.error('DataForSEO Competitors Domain API Error:', error)
    throw error
  }
}

/**
 * Call DataForSEO Relevant Pages API
 * @param {Object} params - API parameters
 * @param {string} params.target - Target domain to analyze
 * @param {string} params.languageCode - Language code (default: "en")
 * @param {string} params.locationCode - Location code (default: 2840 for US)
 * @param {number} params.limit - Number of results (default: 100)
 * @returns {Promise<Object>} API response
 */
export const getRelevantPages = async ({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100
}) => {
  try {
    const requestBody = [
      {
        target,
        language_code: languageCode,
        location_code: locationCode,
        limit
      }
    ]

    const response = await fetch(`${DATAFORSEO_API_URL}/dataforseo_labs/google/relevant_pages/live`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
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
  } catch (error) {
    console.error('DataForSEO Relevant Pages API Error:', error)
    throw error
  }
}

/**
 * Call DataForSEO Backlinks Summary API
 * @param {Object} params - API parameters
 * @param {string} params.target - Target domain/URL to analyze
 * @param {Array} params.filters - Optional filters array
 * @returns {Promise<Object>} API response
 */
export const getBacklinksSummary = async ({
  target,
  filters = null
}) => {
  try {
    const requestBody = [
      {
        target,
        ...(filters && { filters })
      }
    ]

    const response = await fetch(`${DATAFORSEO_API_URL}/backlinks/summary/live`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
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
  } catch (error) {
    console.error('DataForSEO Backlinks Summary API Error:', error)
    throw error
  }
}

/**
 * Call DataForSEO Keywords For Site API - Gets all keywords a domain ranks for
 * @param {Object} params - API parameters
 * @param {string} params.target - Target domain to analyze
 * @param {string} params.languageCode - Language code (default: "en")
 * @param {string} params.locationCode - Location code (default: 2840 for US)
 * @param {number} params.limit - Number of results (default: 100)
 * @returns {Promise<Object>} API response
 */
export const getKeywordsForSite = async ({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100
}) => {
  try {
    const requestBody = [
      {
        target,
        language_code: languageCode,
        location_code: locationCode,
        limit
      }
    ]


    const response = await fetch(`${DATAFORSEO_API_URL}/dataforseo_labs/google/keywords_for_site/live`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
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
  } catch (error) {
    console.error('DataForSEO Keywords For Site API Error:', error)
    throw error
  }
}

/**
 * Format bulk traffic estimation results
 * @param {Object} apiResponse - Raw API response from DataForSEO
 * @returns {Array} Formatted results array
 */
export const formatBulkTrafficResults = (apiResponse) => {
  
  if (!apiResponse || !apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result[0]

  if (!results || !results.items) {
    return []
  }


  return results.items.map(item => {
    
    // Extract metrics with correct path structure
    const organicMetrics = item.metrics?.organic || {}
    const paidMetrics = item.metrics?.paid || {}
    
    
    const formatted = {
      target: item.target,
      trafficEstimation: {
        // Organic values (FIXED: now using item.metrics.organic path)
        organicEtv: organicMetrics.etv || 0,
        organicCount: organicMetrics.count || 0,
        // Paid values (FIXED: now using item.metrics.paid path)  
        paidEtv: paidMetrics.etv || 0,
        paidCount: paidMetrics.count || 0,
        // Note: API doesn't provide traffic/clicks/cost/monthly data
        // These were non-existent fields causing confusion
        organicTraffic: 0, // Not provided by this API
        organicClicks: 0,  // Not provided by this API
        organicCost: 0,    // Not provided by this API
        paidTraffic: 0,    // Not provided by this API
        paidClicks: 0,     // Not provided by this API
        paidCost: 0,       // Not provided by this API
        monthlyTraffic: 0, // Not provided by this API
        monthlyVisits: 0,  // Not provided by this API
        monthlyClicks: 0   // Not provided by this API
      },
      targetType: item.target_type,
      seType: item.se_type,
      locationCode: item.location_code,
      languageCode: item.language_code
    }
    
    return formatted
  })
}

/**
 * Format competitors domain results
 * @param {Object} apiResponse - Raw API response from DataForSEO
 * @returns {Array} Formatted results array
 */
export const formatCompetitorsResults = (apiResponse) => {
  if (!apiResponse || !apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result[0]

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    domain: item.domain,
    avgPosition: item.avg_position,
    sumPosition: item.sum_position,
    intersections: item.intersections,
    // Competitive overlap metrics
    overlapScore: item.overlap_score || 0,
    competitiveStrength: item.competitive_strength || 0,
    relevanceScore: item.relevance_score || 0,
    competitorLevel: item.competitor_level || 'unknown',
    // Full domain metrics
    fullDomainMetrics: {
      organicKeywords: item.full_domain_metrics?.organic?.keywords || 0,
      organicTraffic: item.full_domain_metrics?.organic?.traffic || 0,
      organicCost: item.full_domain_metrics?.organic?.cost || 0,
      organicEtv: item.full_domain_metrics?.organic?.etv || 0,
      organicCount: item.full_domain_metrics?.organic?.count || 0,
      paidKeywords: item.full_domain_metrics?.paid?.keywords || 0,
      paidTraffic: item.full_domain_metrics?.paid?.traffic || 0,
      paidCost: item.full_domain_metrics?.paid?.cost || 0,
      paidEtv: item.full_domain_metrics?.paid?.etv || 0,
      paidCount: item.full_domain_metrics?.paid?.count || 0
    },
    // Competitor-specific metrics
    competitorMetrics: {
      organicKeywords: item.competitor_metrics?.organic?.keywords || 0,
      organicTraffic: item.competitor_metrics?.organic?.traffic || 0,
      organicCost: item.competitor_metrics?.organic?.cost || 0,
      organicEtv: item.competitor_metrics?.organic?.etv || 0,
      organicCount: item.competitor_metrics?.organic?.count || 0,
      paidKeywords: item.competitor_metrics?.paid?.keywords || 0,
      paidTraffic: item.competitor_metrics?.paid?.traffic || 0,
      paidCost: item.competitor_metrics?.paid?.cost || 0,
      paidEtv: item.competitor_metrics?.paid?.etv || 0,
      paidCount: item.competitor_metrics?.paid?.count || 0
    },
    // Additional metrics
    seType: item.se_type,
    locationCode: item.location_code,
    languageCode: item.language_code
  }))
}

/**
 * Format relevant pages results
 * @param {Object} apiResponse - Raw API response from DataForSEO
 * @returns {Array} Formatted results array
 */
export const formatRelevantPagesResults = (apiResponse) => {
  if (!apiResponse || !apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result[0]

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    page: item.page_address,
    url: item.url || item.page_address,
    domain: item.domain,
    title: item.title,
    description: item.description,
    // Enhanced metrics
    metrics: {
      organicKeywords: item.metrics?.organic?.keywords || 0,
      organicTraffic: item.metrics?.organic?.traffic || 0,
      organicCost: item.metrics?.organic?.cost || 0,
      organicEtv: item.metrics?.organic?.etv || 0,
      organicCount: item.metrics?.organic?.count || 0,
      paidKeywords: item.metrics?.paid?.keywords || 0,
      paidTraffic: item.metrics?.paid?.traffic || 0,
      paidCost: item.metrics?.paid?.cost || 0,
      paidEtv: item.metrics?.paid?.etv || 0,
      paidCount: item.metrics?.paid?.count || 0
    },
    // Page performance indicators
    pageRank: item.page_rank || 0,
    trafficShare: item.traffic_share || 0,
    keywordDensity: item.keyword_density || 0,
    // Timestamps
    firstSeen: item.first_seen,
    lastSeen: item.last_seen,
    lastUpdated: item.last_updated,
    // Location and language
    seType: item.se_type,
    locationCode: item.location_code,
    languageCode: item.language_code
  }))
}

/**
 * Format backlinks summary results
 * @param {Object} apiResponse - Raw API response from DataForSEO
 * @returns {Object} Formatted results object
 */
export const formatBacklinksResults = (apiResponse) => {
  if (!apiResponse || !apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return {}
  }

  const results = apiResponse.tasks[0].result[0]

  if (!results) {
    return {}
  }

  return {
    target: results.target,
    // Backlink counts
    totalBacklinks: results.total_backlinks || 0,
    totalReferringDomains: results.total_referring_domains || 0,
    totalReferringIps: results.total_referring_ips || 0,
    totalReferringSubnets: results.total_referring_subnets || 0,
    // Authority scores
    domainRank: results.domain_rank || results.rank?.domain || 0,
    pageRank: results.page_rank || results.rank?.page || 0,
    authorityScore: results.authority_score || results.domain_authority || 0,
    trustFlow: results.trust_flow || 0,
    citationFlow: results.citation_flow || 0,
    // Rank data
    rankData: {
      ahrefs: results.rank?.ahrefs || 0,
      domain: results.rank?.domain || 0,
      page: results.rank?.page || 0,
      majestic: results.rank?.majestic || 0
    },
    // Anchor and link quality
    totalAnchors: results.total_anchors || 0,
    totalBrokenBacklinks: results.total_broken_backlinks || 0,
    totalBrokenPages: results.total_broken_pages || 0,
    // Growth and trend data
    backlinkGrowth: {
      monthlyGrowth: results.monthly_growth || 0,
      weeklyGrowth: results.weekly_growth || 0,
      recentGained: results.recent_gained || 0,
      recentLost: results.recent_lost || 0,
      netGrowth: results.net_growth || 0
    },
    // Quality metrics
    followLinks: results.follow_links || 0,
    nofollowLinks: results.nofollow_links || 0,
    textLinks: results.text_links || 0,
    imageLinks: results.image_links || 0,
    // Timestamps
    firstSeen: results.first_seen,
    lastSeen: results.last_seen,
    lostDate: results.lost_date,
    lastUpdated: results.last_updated
  }
}

/**
 * Format keywords for site results - NEW API structure
 * @param {Object} apiResponse - Raw API response from DataForSEO Keywords For Site API
 * @returns {Array} Formatted results array
 */
export const formatKeywordsForSiteResults = (apiResponse) => {
  console.log('🔧 KEYWORDS FORMATTER DEBUG - Input API Response:', JSON.stringify(apiResponse, null, 2))
  
  if (!apiResponse || !apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    console.log('❌ KEYWORDS FORMATTER: Missing required structure - tasks/result')
    return []
  }

  const results = apiResponse.tasks[0].result[0]
  console.log('🔧 KEYWORDS FORMATTER DEBUG - Results object:', JSON.stringify(results, null, 2))

  if (!results || !results.items) {
    console.log('❌ KEYWORDS FORMATTER: Missing items array in results')
    return []
  }

  console.log('🔧 KEYWORDS FORMATTER DEBUG - Items array length:', results.items.length)
  console.log('🔧 KEYWORDS FORMATTER DEBUG - First item structure:', JSON.stringify(results.items[0], null, 2))

  return results.items.map(item => {
    console.log('🔧 KEYWORDS FORMATTER: Processing item:', JSON.stringify(item, null, 2))
    
    // Extract keyword_info data (this is where the real metrics are)
    const keywordInfo = item.keyword_info || {}
    const keywordProps = item.keyword_properties || {}
    const searchIntent = item.search_intent_info || {}
    
    const formatted = {
      keyword: item.keyword,
      // Position data not available in this API response
      position: 'N/A', // This API doesn't provide ranking positions
      searchVolume: keywordInfo.search_volume || 0,
      cpc: keywordInfo.cpc || 0,
      competition: keywordInfo.competition || 0,
      competitionLevel: keywordInfo.competition_level || 'N/A',
      // URL not provided by this API
      url: 'N/A', // This API doesn't provide ranking URLs
      domain: results.target, // Use the target domain from results
      // Traffic metrics not available in this API
      traffic: 0, // Not provided by keywords_for_site API
      trafficCost: 0, // Not provided by keywords_for_site API
      seType: item.se_type,
      locationCode: item.location_code,
      languageCode: item.language_code,
      // Rich keyword data available from this API
      monthlySearches: keywordInfo.monthly_searches || [],
      searchVolumeTrend: keywordInfo.search_volume_trend || {},
      difficulty: keywordProps.keyword_difficulty || 0,
      detectedLanguage: keywordProps.detected_language || 'en',
      isAnotherLanguage: keywordProps.is_another_language || false,
      searchIntent: searchIntent.main_intent || 'unknown',
      categories: keywordInfo.categories || [],
      lastUpdated: keywordInfo.last_updated_time
    }
    
    console.log('🔧 KEYWORDS FORMATTER: Final formatted result:', formatted)
    return formatted
  })
}

// Keep old formatter for backward compatibility
export const formatDomainMetricsResults = formatKeywordsForSiteResults
