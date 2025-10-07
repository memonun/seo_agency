import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export const generateSearchExcel = async (searchId, mainKeyword) => {
  try {
    console.log('Starting Excel generation for search_id:', searchId)

    // Fetch all data for this search_id
    const [
      relatedKeywords,
      keywordSuggestions,
      keywordIdeas,
      autocomplete,
      peopleAlsoAsk,
      subtopics,
      serpResults,
      masterKwVariations,
      categories,
      clusters
    ] = await Promise.all([
      supabase.from('related_keywords').select('*').eq('search_id', searchId).order('msv', { ascending: false }),
      supabase.from('keyword_suggestions').select('*').eq('search_id', searchId).order('msv', { ascending: false }),
      supabase.from('keyword_ideas').select('*').eq('search_id', searchId).order('msv', { ascending: false }),
      supabase.from('autocomplete').select('*').eq('search_id', searchId),
      supabase.from('people_also_ask').select('*').eq('search_id', searchId),
      supabase.from('subtopics').select('*').eq('search_id', searchId),
      supabase.from('serp_results').select('*').eq('search_id', searchId),
      supabase.from('master_kw_variations').select('*').eq('search_id', searchId).order('msv', { ascending: false }),
      supabase.from('categories').select('*').eq('search_id', searchId),
      supabase.from('clusters').select('*').eq('search_id', searchId)
    ])

    // Log data counts for debugging
    console.log('Data fetched:')
    console.log('- master_kw_variations:', masterKwVariations.data?.length || 0)
    console.log('- serp_results:', serpResults.data?.length || 0)
    console.log('- related_keywords:', relatedKeywords.data?.length || 0)
    console.log('- keyword_suggestions:', keywordSuggestions.data?.length || 0)
    console.log('- keyword_ideas:', keywordIdeas.data?.length || 0)
    console.log('- people_also_ask:', peopleAlsoAsk.data?.length || 0)
    console.log('- autocomplete:', autocomplete.data?.length || 0)
    console.log('- subtopics:', subtopics.data?.length || 0)

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // Add Master All KW Variations sheet (All Keywords)
    // Columns: Main Keyword | Type | Keyword | MSV | Search Intent | KW Difficulty | Competition | CPC | Answer
    if (masterKwVariations.data && masterKwVariations.data.length > 0) {
      const masterData = masterKwVariations.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Keyword': item.keyword || '-',
        'MSV': item.msv || 0,
        'Search Intent': item.search_intent || '-',
        'KW Difficulty': item.kw_difficulty || 0,
        'Competition': item.competition || '-',
        'CPC': item.cpc || '-',
        'Answer': item.answer || '-'
      }))
      const ws1 = XLSX.utils.json_to_sheet(masterData)
      XLSX.utils.book_append_sheet(workbook, ws1, 'Master All KW Variations')
    }

    // Add SERP Results sheet
    // Columns: Main Keyword | Type | Domain | URL | Title | Description
    if (serpResults.data && serpResults.data.length > 0) {
      const serpData = serpResults.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Domain': item.domain || '-',
        'URL': item.url || '-',
        'Title': item.title || '-',
        'Description': item.description || '-'
      }))
      const ws2 = XLSX.utils.json_to_sheet(serpData)
      XLSX.utils.book_append_sheet(workbook, ws2, 'SERP')
    }

    // Add Related Keywords sheet
    // Columns: Main Keyword | Type | Keyword | MSV | Search Intent | KW Difficulty | Competition | CPC
    if (relatedKeywords.data && relatedKeywords.data.length > 0) {
      const relatedData = relatedKeywords.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Keyword': item.keyword || '-',
        'MSV': item.msv || 0,
        'Search Intent': item.search_intent || '-',
        'KW Difficulty': item.kw_difficulty || 0,
        'Competition': item.competition || '-',
        'CPC': item.cpc || '-'
      }))
      const ws3 = XLSX.utils.json_to_sheet(relatedData)
      XLSX.utils.book_append_sheet(workbook, ws3, 'Related Keywords')
    }

    // Add Keyword Suggestions sheet
    // Columns: Main Keyword | Type | Keyword | MSV | Search Intent | KW Difficulty | Competition | CPC
    if (keywordSuggestions.data && keywordSuggestions.data.length > 0) {
      const suggestionsData = keywordSuggestions.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Keyword': item.keyword || '-',
        'MSV': item.msv || 0,
        'Search Intent': item.search_intent || '-',
        'KW Difficulty': item.kw_difficulty || 0,
        'Competition': item.competition || '-',
        'CPC': item.cpc || '-'
      }))
      const ws4 = XLSX.utils.json_to_sheet(suggestionsData)
      XLSX.utils.book_append_sheet(workbook, ws4, 'Keyword Suggestions')
    }

    // Add Keyword Ideas sheet
    // Columns: Main Keyword | Type | Keyword | MSV | Search Intent | KW Difficulty | Competition | CPC
    if (keywordIdeas.data && keywordIdeas.data.length > 0) {
      const ideasData = keywordIdeas.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Keyword': item.keyword || '-',
        'MSV': item.msv || 0,
        'Search Intent': item.search_intent || '-',
        'KW Difficulty': item.kw_difficulty || 0,
        'Competition': item.competition || '-',
        'CPC': item.cpc || '-'
      }))
      const ws5 = XLSX.utils.json_to_sheet(ideasData)
      XLSX.utils.book_append_sheet(workbook, ws5, 'Keyword Ideas')
    }

    // Add People Also Ask sheet
    // Columns: Main Keyword | Type | People Also Ask | MSV | Search Intent | KW Difficulty | Competition | CPC | PAA Answer
    if (peopleAlsoAsk.data && peopleAlsoAsk.data.length > 0) {
      const paaData = peopleAlsoAsk.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'People Also Ask': item.people_also_ask || '-',
        'MSV': item.msv || 0,
        'Search Intent': item.search_intent || '-',
        'KW Difficulty': item.kw_difficulty || 0,
        'Competition': item.competition || '-',
        'CPC': item.cpc || '-',
        'PAA Answer': item.paa_answer || '-'
      }))
      const ws6 = XLSX.utils.json_to_sheet(paaData)
      XLSX.utils.book_append_sheet(workbook, ws6, 'People Also Ask')
    }

    // Add Autocomplete sheet (simplified)
    // Columns: Main Keyword | Type | Autocomplete
    if (autocomplete.data && autocomplete.data.length > 0) {
      const autocompleteData = autocomplete.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Autocomplete': item.autocomplete || '-'
      }))
      const ws7 = XLSX.utils.json_to_sheet(autocompleteData)
      XLSX.utils.book_append_sheet(workbook, ws7, 'Autocomplete')
    }

    // Add Subtopics sheet (simplified)
    // Columns: Main Keyword | Type | Subtopics
    if (subtopics.data && subtopics.data.length > 0) {
      const subtopicsData = subtopics.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Type': item.type || '-',
        'Subtopics': item.subtopics || '-'
      }))
      const ws8 = XLSX.utils.json_to_sheet(subtopicsData)
      XLSX.utils.book_append_sheet(workbook, ws8, 'Subtopics')
    }

    // Add Categories sheet (optional - not in excel_structure.md but useful)
    if (categories.data && categories.data.length > 0) {
      const categoryData = categories.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Keyword': item.keyword || '-',
        'Category': item.category || '-'
      }))
      const ws9 = XLSX.utils.json_to_sheet(categoryData)
      XLSX.utils.book_append_sheet(workbook, ws9, 'Categories')
    }

    // Add Clusters sheet (optional - not in excel_structure.md but useful)
    if (clusters.data && clusters.data.length > 0) {
      const clusterData = clusters.data.map(item => ({
        'Main Keyword': item.main_keyword || '-',
        'Cluster': item.cluster || '-',
        'Keywords': item.keywords || '-'
      }))
      const ws10 = XLSX.utils.json_to_sheet(clusterData)
      XLSX.utils.book_append_sheet(workbook, ws10, 'Clusters')
    }

    // Failsafe: ensure workbook has at least one sheet
    if (workbook.SheetNames.length === 0) {
      console.warn('No data sheets added, adding fallback sheet')
      const fallbackData = [{
        'Message': 'No research data available for this search',
        'Search ID': searchId,
        'Main Keyword': mainKeyword
      }]
      const ws = XLSX.utils.json_to_sheet(fallbackData)
      XLSX.utils.book_append_sheet(workbook, ws, 'Info')
    }

    console.log('Total sheets created:', workbook.SheetNames.length)
    console.log('Sheet names:', workbook.SheetNames)

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0]
    // Sanitize filename but preserve Turkish characters
    const sanitizedKeyword = mainKeyword
      .replace(/[<>:"/\\|?*]/g, '_') // Only remove filesystem-invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .toLowerCase()
    const filename = `${sanitizedKeyword}_keyword_research_${date}.xlsx`

    // Write and download file
    XLSX.writeFile(workbook, filename)

    return { success: true }
  } catch (error) {
    console.error('Error generating Excel file:', error)
    throw error
  }
}
