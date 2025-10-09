import emailjs from '@emailjs/browser'

// EmailJS configuration from environment variables
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || ''
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || ''

/**
 * Initialize EmailJS with public key
 */
const initEmailJS = () => {
  if (EMAILJS_PUBLIC_KEY) {
    emailjs.init(EMAILJS_PUBLIC_KEY)
  }
}

// Initialize on module load
initEmailJS()

/**
 * Format domain analytics results for email
 * @param {Array} results - Formatted domain results
 * @param {Object} searchParams - Search parameters used
 * @returns {string} HTML formatted email content
 */
const formatDomainResultsForEmail = (results, searchParams) => {
  if (!results || results.length === 0) {
    return '<p>No domains found matching your search criteria.</p>'
  }

  let html = `
    <h2>Domain Analytics Results</h2>
    <p><strong>Search Parameters:</strong></p>
    <ul>
      <li>Domain Pattern: ${searchParams.domainPattern}</li>
      <li>Filter Type: ${searchParams.filterType}</li>
      <li>Results Found: ${results.length}</li>
    </ul>
    <hr>
  `

  results.forEach((domain, index) => {
    html += `
      <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #e5e5e5; background: #f9f9f9;">
        <h3 style="margin-top: 0;">${index + 1}. ${domain.domain}</h3>

        <div style="margin-bottom: 15px;">
          <h4 style="color: #666; font-size: 14px; margin-bottom: 8px;">DOMAIN INFORMATION</h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Created:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.created ? new Date(domain.created).toLocaleDateString() : 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Expires:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.expires ? new Date(domain.expires).toLocaleDateString() : 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Last Updated:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.updated ? new Date(domain.updated).toLocaleDateString() : 'N/A'}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 15px;">
          <h4 style="color: #666; font-size: 14px; margin-bottom: 8px;">BACKLINKS</h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Total Backlinks:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.backlinks.total.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Referring Domains:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.backlinks.referringDomains.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Referring IPs:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.backlinks.referringIps.toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 15px;">
          <h4 style="color: #666; font-size: 14px; margin-bottom: 8px;">ORGANIC SEARCH</h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Position 1:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.organic.pos1.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Position 2-3:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.organic.pos2_3.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Position 4-10:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.organic.pos4_10.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Est. Traffic Value:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>$${domain.organic.etv.toLocaleString()}</strong></td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Total Keywords:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.organic.count.toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div>
          <h4 style="color: #666; font-size: 14px; margin-bottom: 8px;">PAID SEARCH</h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Position 1:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.paid.pos1.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Position 2-3:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.paid.pos2_3.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Position 4-10:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.paid.pos4_10.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Est. Traffic Value:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>$${domain.paid.etv.toLocaleString()}</strong></td>
            </tr>
            <tr>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;"><strong>Total Keywords:</strong></td>
              <td style="padding: 5px; border-bottom: 1px solid #ddd;">${domain.paid.count.toLocaleString()}</td>
            </tr>
          </table>
        </div>
      </div>
    `
  })

  html += `
    <hr>
    <p style="color: #666; font-size: 12px;">
      Generated on ${new Date().toLocaleString()}
    </p>
  `

  return html
}

/**
 * Send domain analytics results via email
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email address
 * @param {string} params.fromName - Sender name
 * @param {Array} params.results - Domain analytics results
 * @param {Object} params.searchParams - Search parameters
 * @returns {Promise<Object>} EmailJS response
 */
export const sendDomainAnalyticsEmail = async ({
  toEmail,
  fromName = 'Domain Analytics',
  results,
  searchParams
}) => {
  try {
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      throw new Error('EmailJS credentials not configured. Please check your .env file.')
    }

    const emailContent = formatDomainResultsForEmail(results, searchParams)

    const templateParams = {
      to_email: toEmail,
      from_name: fromName,
      subject: `Domain Analytics Results - ${searchParams.domainPattern}`,
      results_count: results.length,
      domain_pattern: searchParams.domainPattern,
      filter_type: searchParams.filterType,
      html_content: emailContent,
      // Additional plain text summary
      summary: `Found ${results.length} domain(s) matching pattern "${searchParams.domainPattern}" with filter "${searchParams.filterType}"`
    }

    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams
    )

    return {
      success: true,
      message: `Results sent to ${toEmail}`,
      response
    }
  } catch (error) {
    console.error('Email sending error:', error)
    return {
      success: false,
      message: error.message || 'Failed to send email',
      error
    }
  }
}
