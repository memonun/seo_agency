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
