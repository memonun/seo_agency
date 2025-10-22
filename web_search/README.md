# SERP Content Analyzer - Urgent Test Script

Quick test script for analyzing article content from SERP results. Created for crisis coverage analysis (e.g., Romania crisis).

## 🚀 Quick Start (2 minutes)

### 1. Install dependencies
```bash
cd web_search
pip install -r requirements.txt
```

### 2. Set environment variables
```bash
# Option A: Export in terminal (temporary)
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
export OPENAI_API_KEY="your_openai_key_here"

# Option B: Create .env file (persistent)
cp .env.example .env
# Then edit .env with your credentials
source .env
```

**Finding your Supabase Service Role Key:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **service_role** key (NOT the anon key)

### 3. Run the script
```bash
python serp_content_analyzer.py "Romania crisis" 10
```

## 📝 Usage

```bash
python serp_content_analyzer.py <keyword> [limit] [crisis_context]
```

**Arguments:**
- `keyword` (required): Search keyword to filter SERP results
- `limit` (optional): Max number of URLs to analyze (default: 10)
- `crisis_context` (optional): Crisis context/description for AI to consider during analysis

**Examples:**
```bash
# Basic analysis (single keyword)
python serp_content_analyzer.py "clash royale" 10

# Analysis WITH crisis context
python serp_content_analyzer.py "Romania" 10 "Political instability and election controversy in Romania"

# MULTIPLE KEYWORDS with same context (comma-separated)
python serp_content_analyzer.py "Fenerbahce,Saadettin Saran,Aziz Yildirim" 10 "Fenerbahce presidential crisis and leadership controversy"

# Multiple keywords without context
python serp_content_analyzer.py "Romania crisis,Bucharest protests,election dispute" 5
```

### 🔑 Multi-Keyword Analysis
When analyzing **multiple related keywords** (like different aspects of the same crisis), use comma-separated keywords:
- Fetches URLs for each keyword
- Removes duplicates automatically
- Tracks which keyword(s) matched each URL
- Provides **per-keyword sentiment breakdown**
- Generates one unified analysis with crisis context

## 📊 What It Does

1. **Fetches URLs** from `serp_results` table matching your keyword(s)
   - Supports multiple comma-separated keywords
   - Removes duplicate URLs automatically
   - Tracks which keyword(s) matched each URL
2. **Scrapes content** from each URL (removes navigation, ads, etc.)
3. **AI Analysis** using GPT-4o-mini for each article:
   - Main angle/perspective
   - Tone (neutral, alarming, hopeful, etc.)
   - Key points covered
   - Target audience
   - Crisis framing (in relation to provided context)
   - **News sentiment** (positive/negative/neutral)
4. **Sentiment Distribution** across all articles:
   - `analyzed_urls`: Total URLs analyzed
   - `positive_news`: Number of positive articles
   - `negative_news`: Number of negative articles
   - `neutral_news`: Number of neutral articles
   - **Per-keyword breakdown** (when using multiple keywords)
5. **Overall Summary** considering crisis context
6. **Key Findings** - 5 critical bullet points from the analysis
7. **Executive Summary** - Actionable summary with:
   - Current situation assessment
   - Severity/impact level (low/medium/high)
   - Recommended immediate action (respond/stay silent/monitor)
   - Key talking points if response needed
8. **Outputs JSON report** with all analyses

## 📁 Output

Results are saved to the `web_search/serp_analysis/` directory:
```
web_search/serp_analysis/analysis_<keyword>_<timestamp>.json
```

Example: `web_search/serp_analysis/analysis_Romania_crisis_20251010_143022.json`

## 🔧 Credentials Needed

- **Supabase Service Role Key**: Get from Settings → API in your Supabase dashboard (use service_role, not anon key)
- **OpenAI API Key**: Your OpenAI API key with GPT-4 access

## ⚠️ Notes

- This is a **TEST SCRIPT** - not integrated into the app
- Designed for urgent/quick analysis
- Rate limits: Adjust timeout/delays if hitting API limits
- Cost: ~$0.01-0.05 per article analyzed (GPT-4o-mini)

## 🐛 Troubleshooting

**"SUPABASE_SERVICE_ROLE_KEY not set"**: Export the environment variable or check your .env file
**"OPENAI_API_KEY not set"**: Export the environment variable
**"No results found"**: Try a different keyword or check database
**Scraping errors**: Some sites block scrapers or have complex layouts
