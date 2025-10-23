# URL Sentiment Analyzer

Standalone sentiment analysis tool for directly provided URLs. Analyzes article content, tone, and sentiment without requiring database access.

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd web_search
pip install -r requirements.txt
```

### 2. Set environment variable
```bash
export OPENAI_API_KEY="your_openai_key_here"
```

### 3. Run the script
```bash
# Single URL
python url_sentiment_analyzer.py "https://example.com/article"

# Multiple URLs
python url_sentiment_analyzer.py "url1,url2,url3"

# With context
python url_sentiment_analyzer.py "url1,url2" "Romania election crisis"
```

## 📝 Usage

```bash
python url_sentiment_analyzer.py <urls> [context]
```

**Arguments:**
- `urls` (required): Single URL or comma-separated URLs
- `context` (optional): Contextual statement for focused analysis

**Examples:**

```bash
# Analyze single article
python url_sentiment_analyzer.py "https://example.com/news/article"

# Analyze multiple articles
python url_sentiment_analyzer.py "https://site1.com/article1,https://site2.com/article2,https://site3.com/article3"

# Analyze with context (crisis analysis)
python url_sentiment_analyzer.py "https://news.com/romania,https://bbc.com/romania" "Romania election controversy and political crisis"

# Analyze product reviews with context
python url_sentiment_analyzer.py "url1,url2,url3" "iPhone 15 Pro launch reception"
```

## 📊 What It Does

1. **Validates URLs** - Checks format and structure of provided URLs
2. **Removes Duplicates** - Automatically deduplicates URL list
3. **Scrapes Content** - Extracts article content and title from each URL
4. **AI Analysis** - Uses GPT-4o-mini to analyze each article:
   - Main angle/perspective
   - Tone (neutral, alarming, hopeful, critical, etc.)
   - Key points covered
   - Target audience
   - Relation to context (if provided)
   - **News sentiment** (positive/negative/neutral)
5. **Sentiment Distribution** - Aggregates sentiment across all articles
6. **Overall Summary** - Generates comprehensive summary considering context
7. **Key Findings** - Extracts 5 critical bullet points
8. **Executive Summary** - Provides actionable summary with key takeaways
9. **JSON Output** - Saves complete analysis report

## 📁 Output

Results are saved to the `web_search/url_analysis/` directory:
```
web_search/url_analysis/analysis_urls_<timestamp>.json
```

Example: `web_search/url_analysis/analysis_urls_20251019_143022.json`

### Output Structure

```json
{
  "source": "direct_urls",
  "input_urls": ["https://example.com/article1", "https://example.com/article2"],
  "timestamp": "20251019_143022",
  "context": "Optional context or null",
  "sentiment_distribution": {
    "analyzed_urls": 2,
    "positive_news": 1,
    "negative_news": 0,
    "neutral_news": 1,
    "failed_analyses": 0
  },
  "total_analyzed": 2,
  "successful_analyses": 2,
  "overall_summary": "Comprehensive summary text...",
  "key_findings": [
    "Finding 1",
    "Finding 2",
    "Finding 3",
    "Finding 4",
    "Finding 5"
  ],
  "executive_summary": "Executive summary text...",
  "individual_analyses": [
    {
      "url": "https://example.com/article1",
      "title": "Article Title",
      "error": null,
      "analysis": {
        "angle": "Main perspective of the article",
        "tone": "neutral",
        "key_points": ["Point 1", "Point 2", "Point 3"],
        "target_audience": "General readers",
        "context_relation": "How it relates to context (if provided)",
        "news_sentiment": "neutral"
      },
      "news_sentiment": "neutral",
      "tokens_used": 450
    }
  ]
}
```

## 🔧 Environment Variables

- **OPENAI_API_KEY**: Required - Your OpenAI API key

## 💡 Use Cases

### Crisis Management
Analyze multiple news articles about a crisis event:
```bash
python url_sentiment_analyzer.py "url1,url2,url3" "Company data breach incident"
```

### Product Launch Analysis
Assess coverage of a product launch:
```bash
python url_sentiment_analyzer.py "url1,url2,url3" "iPhone 15 launch"
```

### General Content Analysis
Analyze articles without specific context:
```bash
python url_sentiment_analyzer.py "url1,url2,url3"
```

### Competitive Analysis
Compare how different sources cover the same topic:
```bash
python url_sentiment_analyzer.py "competitor1-url,competitor2-url,competitor3-url" "Market comparison"
```

## 🆚 Difference from SERP Content Analyzer

| Feature | url_sentiment_analyzer.py | serp_content_analyzer.py |
|---------|--------------------------|--------------------------|
| **Input** | Direct URLs (CLI parameter) | Database keyword search |
| **Dependencies** | OpenAI + scraping libs only | Supabase + OpenAI + scraping |
| **Use Case** | Ad-hoc URL analysis | Analyzing indexed SERP results |
| **Setup** | No database needed | Requires Supabase connection |
| **Context** | Optional parameter | Optional parameter |

## ⚠️ Notes

- **Cost**: ~$0.01-0.05 per article analyzed (GPT-4o-mini pricing)
- **Rate Limits**: Respects OpenAI API rate limits
- **Timeout**: 10 seconds per URL scraping attempt
- **Content Limit**: First 8000 characters per article (for API efficiency)
- **Error Handling**: Continues analyzing remaining URLs if some fail

## 🐛 Troubleshooting

**"OPENAI_API_KEY not set"**
- Export the environment variable: `export OPENAI_API_KEY="your-key"`

**"Invalid URL structure"**
- Ensure URLs start with `http://` or `https://`
- Check for typos in URL format

**"Scraping error"**
- Some sites block scrapers or have anti-bot protection
- Some sites have complex layouts that are hard to parse
- Timeout may occur for slow-loading sites

**"Content too short or unavailable"**
- Page may not have extractable text content
- Content might be behind paywall or login

**All analyses fail**
- Check internet connectivity
- Verify OpenAI API key is valid
- Check if URLs are accessible

## 📋 Requirements

```
requests>=2.31.0
beautifulsoup4>=4.12.0
openai>=1.0.0
```

## 🔒 Security

- Only analyzes publicly accessible URLs
- Does not store or transmit URLs to any third party except OpenAI for analysis
- Does not handle authentication or bypass paywalls
- Validates URL format to prevent malicious input

## 📄 License

Part of the SEO Agency project.
