#!/usr/bin/env python3
"""
SERP Content Analyzer - Urgent Test Script
Analyzes article content from SERP results for crisis coverage analysis
"""

import os
import sys
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from supabase import create_client, Client
from openai import OpenAI

# Configuration
SUPABASE_URL = "https://jkoqttcselznnnuljfxf.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Supabase client
def get_supabase_client():
    """Initialize Supabase client"""
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        return supabase
    except Exception as e:
        print(f"❌ Supabase connection error: {e}")
        sys.exit(1)

def fetch_urls_by_keyword(keyword, limit=10):
    """Fetch URLs from serp_results table by keyword"""
    supabase = get_supabase_client()

    try:
        response = supabase.table('serp_results') \
            .select('id, main_keyword, url, title, description, created_at') \
            .ilike('main_keyword', f'%{keyword}%') \
            .order('created_at', desc=True) \
            .limit(limit) \
            .execute()

        return [
            {
                "id": row['id'],
                "keyword": row['main_keyword'],
                "url": row['url'],
                "title": row['title'],
                "description": row['description'],
                "created_at": row['created_at']
            }
            for row in response.data
        ]
    except Exception as e:
        print(f"❌ Error fetching data: {e}")
        sys.exit(1)

def scrape_article_content(url, timeout=10):
    """Scrape main content from a URL"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')

        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe']):
            element.decompose()

        # Try to find main content area
        main_content = (
            soup.find('article') or
            soup.find('main') or
            soup.find('div', class_=lambda x: x and ('content' in x.lower() or 'article' in x.lower())) or
            soup.find('body')
        )

        if main_content:
            # Extract text, clean up whitespace
            text = ' '.join(main_content.stripped_strings)
            # Limit to first 8000 chars for API efficiency
            return text[:8000] if len(text) > 8000 else text

        return None

    except Exception as e:
        print(f"   ⚠️  Scraping error for {url}: {str(e)[:100]}")
        return None

def analyze_with_ai(content, keyword, title, url, crisis_context=None):
    """Analyze article content using OpenAI"""
    if not content or len(content) < 100:
        return {
            "error": "Content too short or unavailable",
            "analysis": None,
            "news_sentiment": "neutral"
        }

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        # Build context-aware prompt
        context_section = ""
        if crisis_context:
            context_section = f"""
CRISIS CONTEXT:
{crisis_context}

Analyze this article specifically in relation to the above crisis context.
"""

        prompt = f"""Analyze this article about "{keyword}" from: {title}

{context_section}
Article content:
{content}

Provide a concise analysis (under 200 words) covering:
1. Main angle/perspective on the topic
2. Tone (neutral, alarming, hopeful, critical, etc.)
3. Key points covered
4. Target audience/intent
5. Crisis framing (if applicable - how does it relate to the crisis context?)
6. News sentiment: Classify as "positive", "negative", or "neutral" based on how the article frames the crisis/topic

Format as JSON with keys: angle, tone, key_points (array), target_audience, crisis_framing, news_sentiment"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a media analyst specializing in crisis coverage analysis. Provide objective, structured analysis."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        analysis = json.loads(response.choices[0].message.content)
        return {
            "error": None,
            "analysis": analysis,
            "news_sentiment": analysis.get("news_sentiment", "neutral"),
            "tokens_used": response.usage.total_tokens
        }

    except Exception as e:
        return {
            "error": f"AI analysis error: {str(e)[:200]}",
            "analysis": None,
            "news_sentiment": "neutral"
        }

def generate_overall_summary(analyses, crisis_context=None):
    """Generate an overall summary from all analyses"""
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        # Prepare summary of all analyses
        analyses_text = "\n\n".join([
            f"Article {i+1} ({a['url']}):\n- Sentiment: {a.get('news_sentiment', 'neutral')}\n- Angle: {a.get('angle', 'N/A')}\n- Tone: {a.get('tone', 'N/A')}\n- Key points: {', '.join(a.get('key_points', [])[:3])}\n- Crisis framing: {a.get('crisis_framing', 'N/A')}"
            for i, a in enumerate(analyses) if a.get('analysis')
        ])

        context_section = ""
        if crisis_context:
            context_section = f"""
CRISIS CONTEXT:
{crisis_context}

Provide a summary specifically considering this crisis context.
"""

        prompt = f"""Based on these {len(analyses)} articles, provide an overall summary:

{context_section}
{analyses_text}

Summarize:
1. Common themes and perspectives in relation to the crisis
2. Overall tone across coverage (positive/negative/neutral sentiment distribution)
3. Key differences in approach and framing
4. How the crisis is being portrayed across different sources
5. Any notable bias or patterns in the coverage

Keep it under 300 words."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior media analyst."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4
        )

        return response.choices[0].message.content

    except Exception as e:
        return f"Error generating summary: {str(e)}"

def generate_key_findings_and_executive_summary(analyses, sentiment_distribution, crisis_context=None):
    """Generate 5 key findings and an executive summary"""
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        # Prepare data summary
        successful_analyses = [a for a in analyses if a.get('analysis') and not a.get('error')]

        sentiment_summary = f"""
Total analyzed: {sentiment_distribution['analyzed_urls']}
Positive: {sentiment_distribution['positive_news']}
Negative: {sentiment_distribution['negative_news']}
Neutral: {sentiment_distribution['neutral_news']}
Failed: {sentiment_distribution['failed_analyses']}
"""

        analyses_summary = "\n".join([
            f"- {a.get('title', 'N/A')[:80]}: {a.get('news_sentiment', 'neutral')} sentiment"
            for a in successful_analyses[:15]  # Limit to prevent token overflow
        ])

        context_section = ""
        if crisis_context:
            context_section = f"""
CRISIS CONTEXT:
{crisis_context}
"""

        prompt = f"""You are a crisis management consultant analyzing media coverage. Based on the analysis results below, provide:

{context_section}

SENTIMENT DISTRIBUTION:
{sentiment_summary}

ANALYZED ARTICLES:
{analyses_summary}

Provide TWO outputs in JSON format:
1. "key_findings": An array of exactly 5 bullet points highlighting the most critical findings from this analysis (each under 100 chars)
2. "executive_summary": A single paragraph (150-200 words) that provides an actionable executive summary showing:
   - Current situation assessment
   - Severity/impact level (low/medium/high)
   - Recommended immediate action (respond publicly, stay silent, monitor, etc.)
   - Key talking points if response is needed

Format as JSON with keys: key_findings (array of 5 strings), executive_summary (string)"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior crisis management consultant specializing in media analysis and strategic communications."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        return json.loads(response.choices[0].message.content)

    except Exception as e:
        return {
            "error": f"Error generating findings: {str(e)}",
            "key_findings": [],
            "executive_summary": ""
        }

def main():
    """Main execution function"""
    if len(sys.argv) < 2:
        print("Usage: python serp_content_analyzer.py <keyword(s)> [limit] [crisis_context]")
        print("Example: python serp_content_analyzer.py 'Romania crisis' 10")
        print('Example with context: python serp_content_analyzer.py "Romania" 10 "Political instability and election controversy"')
        print('\nMultiple keywords (comma-separated):')
        print('python serp_content_analyzer.py "Fenerbahce,Saadettin Saran,Aziz Yildirim" 10 "Fenerbahce crisis context"')
        sys.exit(1)

    keyword_input = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    crisis_context = sys.argv[3] if len(sys.argv) > 3 else None

    # Parse keywords - support comma-separated list
    keywords = [k.strip() for k in keyword_input.split(',')]

    # Validate environment variables
    if not SUPABASE_SERVICE_ROLE_KEY:
        print("❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set")
        sys.exit(1)

    if not OPENAI_API_KEY:
        print("❌ Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    print(f"\n🔍 SERP Content Analyzer - Testing")
    print(f"=" * 60)
    if len(keywords) == 1:
        print(f"Keyword: {keywords[0]}")
    else:
        print(f"Keywords ({len(keywords)}): {', '.join(keywords)}")
    print(f"Limit per keyword: {limit}")
    if crisis_context:
        print(f"Crisis Context: {crisis_context}")
    print(f"=" * 60)

    # Step 1: Fetch URLs for all keywords
    print(f"\n📊 Fetching URLs from database...")
    all_results = []

    for keyword in keywords:
        print(f"   🔎 Searching for: {keyword}")
        results = fetch_urls_by_keyword(keyword, limit)

        # Tag each result with the source keyword
        for result in results:
            result['source_keyword'] = keyword

        all_results.extend(results)
        print(f"      ✅ Found {len(results)} URLs")

    print(f"\n   📊 Total URLs collected: {len(all_results)}")

    if not all_results:
        print("❌ No results found for any keywords")
        sys.exit(0)

    # Remove duplicates based on URL
    unique_results = {}
    for result in all_results:
        url = result['url']
        if url not in unique_results:
            unique_results[url] = result
        else:
            # If duplicate, add the source keyword to track all keywords it matches
            if 'all_source_keywords' not in unique_results[url]:
                unique_results[url]['all_source_keywords'] = [unique_results[url]['source_keyword']]
            unique_results[url]['all_source_keywords'].append(result['source_keyword'])

    results = list(unique_results.values())

    if len(results) < len(all_results):
        print(f"   🔄 Removed {len(all_results) - len(results)} duplicate URLs")
        print(f"   ✅ Final unique URLs: {len(results)}")

    # Step 2: Scrape and analyze each URL
    print(f"\n🕷️  Scraping and analyzing articles...")
    analyses = []

    for i, result in enumerate(results, 1):
        url = result['url']
        title = result['title']
        source_kw = result.get('source_keyword', 'unknown')
        all_kws = result.get('all_source_keywords', [source_kw])

        print(f"\n   [{i}/{len(results)}] {title[:50]}...")
        print(f"   🔗 {url}")
        if len(all_kws) > 1:
            print(f"   🏷️  Matched keywords: {', '.join(all_kws)}")
        else:
            print(f"   🏷️  Keyword: {source_kw}")

        # Scrape content
        content = scrape_article_content(url)
        if not content:
            analyses.append({
                "url": url,
                "title": title,
                "error": "Failed to scrape content",
                "analysis": None
            })
            continue

        print(f"   📄 Scraped {len(content)} characters")

        # Analyze with AI
        print(f"   🤖 Analyzing...")
        # Use all matched keywords for context
        keyword_context = ', '.join(all_kws) if len(all_kws) > 1 else source_kw
        analysis_result = analyze_with_ai(content, keyword_context, title, url, crisis_context)

        analyses.append({
            "url": url,
            "title": title,
            "source_keyword": source_kw,
            "all_matched_keywords": all_kws if len(all_kws) > 1 else None,
            "original_keyword": result['keyword'],
            **analysis_result
        })

        if analysis_result['error']:
            print(f"   ❌ {analysis_result['error']}")
        else:
            print(f"   ✅ Analysis complete ({analysis_result.get('tokens_used', 0)} tokens)")

    # Step 3: Calculate sentiment distribution
    sentiment_distribution = {
        "analyzed_urls": len(results),
        "positive_news": len([a for a in analyses if a.get('news_sentiment') == 'positive' and not a.get('error')]),
        "negative_news": len([a for a in analyses if a.get('news_sentiment') == 'negative' and not a.get('error')]),
        "neutral_news": len([a for a in analyses if a.get('news_sentiment') == 'neutral' and not a.get('error')]),
        "failed_analyses": len([a for a in analyses if a.get('error')])
    }

    # Calculate per-keyword breakdown if multiple keywords
    if len(keywords) > 1:
        keyword_breakdown = {}
        for kw in keywords:
            keyword_analyses = [a for a in analyses if a.get('source_keyword') == kw and not a.get('error')]
            keyword_breakdown[kw] = {
                "total": len([a for a in analyses if a.get('source_keyword') == kw]),
                "positive": len([a for a in keyword_analyses if a.get('news_sentiment') == 'positive']),
                "negative": len([a for a in keyword_analyses if a.get('news_sentiment') == 'negative']),
                "neutral": len([a for a in keyword_analyses if a.get('news_sentiment') == 'neutral'])
            }
        sentiment_distribution["keyword_breakdown"] = keyword_breakdown

    # Step 4: Generate overall summary
    print(f"\n📝 Generating overall summary...")
    overall_summary = generate_overall_summary(analyses, crisis_context)

    # Step 4.5: Generate key findings and executive summary
    print(f"\n🎯 Generating key findings and executive summary...")
    findings_and_summary = generate_key_findings_and_executive_summary(analyses, sentiment_distribution, crisis_context)

    # Step 5: Output results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Create output directory if it doesn't exist
    output_dir = os.path.join(os.path.dirname(__file__), 'serp_analysis')
    os.makedirs(output_dir, exist_ok=True)

    # Create filename from keywords
    if len(keywords) == 1:
        filename_base = keywords[0].replace(' ', '_')
    else:
        # Use first keyword + "multi" for multiple keywords
        filename_base = f"{keywords[0].replace(' ', '_')}_multi"

    output_file = os.path.join(output_dir, f"analysis_{filename_base}_{timestamp}.json")

    output = {
        "keywords": keywords if len(keywords) > 1 else keywords[0],
        "timestamp": timestamp,
        "crisis_context": crisis_context,
        "sentiment_distribution": sentiment_distribution,
        "total_analyzed": len(results),
        "successful_analyses": len([a for a in analyses if not a.get('error')]),
        "overall_summary": overall_summary,
        "key_findings": findings_and_summary.get('key_findings', []),
        "executive_summary": findings_and_summary.get('executive_summary', ''),
        "individual_analyses": analyses
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)

    print(f"\n" + "=" * 60)
    print(f"✅ ANALYSIS COMPLETE")
    print(f"=" * 60)
    print(f"\n📊 OVERALL SENTIMENT DISTRIBUTION:")
    print(f"   Analyzed URLs: {sentiment_distribution['analyzed_urls']}")
    print(f"   Positive News: {sentiment_distribution['positive_news']}")
    print(f"   Negative News: {sentiment_distribution['negative_news']}")
    print(f"   Neutral News: {sentiment_distribution['neutral_news']}")
    if sentiment_distribution['failed_analyses'] > 0:
        print(f"   Failed Analyses: {sentiment_distribution['failed_analyses']}")

    # Show per-keyword breakdown if multiple keywords
    if len(keywords) > 1 and 'keyword_breakdown' in sentiment_distribution:
        print(f"\n📊 PER-KEYWORD BREAKDOWN:")
        for kw, stats in sentiment_distribution['keyword_breakdown'].items():
            print(f"\n   {kw}:")
            print(f"      Total: {stats['total']}")
            print(f"      Positive: {stats['positive']}")
            print(f"      Negative: {stats['negative']}")
            print(f"      Neutral: {stats['neutral']}")

    print(f"\n📁 Full results saved to: {output_file}")
    print(f"\n📝 OVERALL SUMMARY:\n")
    print(overall_summary)

    # Display key findings
    if findings_and_summary.get('key_findings'):
        print(f"\n" + "=" * 60)
        print(f"🎯 KEY FINDINGS:")
        print(f"=" * 60)
        for i, finding in enumerate(findings_and_summary['key_findings'], 1):
            print(f"{i}. {finding}")

    # Display executive summary
    if findings_and_summary.get('executive_summary'):
        print(f"\n" + "=" * 60)
        print(f"📋 EXECUTIVE SUMMARY:")
        print(f"=" * 60)
        print(f"\n{findings_and_summary['executive_summary']}")

    print(f"\n" + "=" * 60)

if __name__ == "__main__":
    main()
