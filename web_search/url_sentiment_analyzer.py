#!/usr/bin/env python3
"""
URL Sentiment Analyzer
Analyzes sentiment and content of articles from directly provided URLs
No database dependency - standalone analysis tool
"""

import os
import sys
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import urlparse
from openai import OpenAI

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def validate_url(url):
    """Validate URL format and structure"""
    if not url.startswith(('http://', 'https://')):
        return False, "URL must start with http:// or https://"

    try:
        result = urlparse(url)
        if not all([result.scheme, result.netloc]):
            return False, "Invalid URL structure"
        return True, None
    except Exception as e:
        return False, f"URL parsing error: {e}"


def parse_urls(url_string):
    """Parse comma-separated URLs and validate them"""
    urls = [u.strip() for u in url_string.split(',') if u.strip()]

    valid_urls = []
    invalid_urls = []

    for url in urls:
        is_valid, error = validate_url(url)
        if is_valid:
            valid_urls.append(url)
        else:
            invalid_urls.append((url, error))

    return valid_urls, invalid_urls


def scrape_article_content(url, timeout=10):
    """Scrape main content and title from a URL"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')

        # Extract title
        title_tag = soup.find('title')
        title = title_tag.get_text().strip() if title_tag else url

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
            content = text[:8000] if len(text) > 8000 else text

            return {
                'content': content,
                'title': title,
                'error': None
            }

        return {
            'content': None,
            'title': title,
            'error': 'Could not extract main content'
        }

    except Exception as e:
        return {
            'content': None,
            'title': url,
            'error': f"Scraping error: {str(e)[:100]}"
        }


def analyze_with_ai(content, title, url, context=None):
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
        if context:
            context_section = f"""
CONTEXT:
{context}

Analyze this article specifically in relation to the above context.
"""
            prompt_intro = f"""Analyze this article: {title}

{context_section}
Article content:
{content}

Provide a concise analysis (under 200 words) covering:
1. Main angle/perspective on the topic
2. Tone (neutral, alarming, hopeful, critical, etc.)
3. Key points covered
4. Target audience/intent
5. How the article relates to the provided context
6. News sentiment: Classify as "positive", "negative", or "neutral" based on how the article frames the topic/context

Format as JSON with keys: angle, tone, key_points (array), target_audience, context_relation, news_sentiment"""
        else:
            prompt_intro = f"""Analyze this article: {title}

Article content:
{content}

Provide a concise analysis (under 200 words) covering:
1. Main angle/perspective
2. Tone (neutral, alarming, hopeful, critical, etc.)
3. Key points covered
4. Target audience/intent
5. Overall framing and message
6. News sentiment: Classify as "positive", "negative", or "neutral" based on the article's overall tone

Format as JSON with keys: angle, tone, key_points (array), target_audience, overall_framing, news_sentiment"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a media analyst specializing in content analysis. Provide objective, structured analysis."
                },
                {"role": "user", "content": prompt_intro}
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


def generate_overall_summary(analyses, context=None):
    """Generate an overall summary from all analyses"""
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        # Prepare summary of all analyses
        analyses_text = "\n\n".join([
            f"Article {i+1} ({a['url']}):\n- Sentiment: {a.get('news_sentiment', 'neutral')}\n- Angle: {a.get('angle', 'N/A')}\n- Tone: {a.get('tone', 'N/A')}\n- Key points: {', '.join(a.get('key_points', [])[:3])}"
            for i, a in enumerate(analyses) if a.get('analysis')
        ])

        if context:
            context_section = f"""
CONTEXT:
{context}

Provide a summary specifically considering this context.
"""
            prompt = f"""Based on these {len(analyses)} articles, provide an overall summary:

{context_section}
{analyses_text}

Summarize:
1. Common themes and perspectives in relation to the context
2. Overall tone across coverage (positive/negative/neutral sentiment distribution)
3. Key differences in approach and framing
4. How the topic is being portrayed across different sources
5. Any notable patterns in the coverage

Keep it under 300 words."""
        else:
            prompt = f"""Based on these {len(analyses)} articles from the provided URLs, provide an overall summary:

{analyses_text}

Summarize:
1. Common themes and perspectives
2. Overall tone across coverage (positive/negative/neutral sentiment distribution)
3. Key differences in approach and framing
4. How the topic is being portrayed across different sources
5. Any notable patterns in the coverage

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


def generate_key_findings_and_executive_summary(analyses, sentiment_distribution, context=None):
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

        if context:
            context_section = f"""
CONTEXT:
{context}
"""
            system_prompt = "You are a media analyst. Based on the analysis results below, provide insights considering the given context."
        else:
            context_section = ""
            system_prompt = "You are a media analyst. Based on the analysis results below, provide objective insights."

        prompt = f"""{system_prompt}

{context_section}

SENTIMENT DISTRIBUTION:
{sentiment_summary}

ANALYZED ARTICLES:
{analyses_summary}

Provide TWO outputs in JSON format:
1. "key_findings": An array of exactly 5 bullet points highlighting the most critical findings from this analysis (each under 100 chars)
2. "executive_summary": A single paragraph (150-200 words) that provides an actionable summary showing:
   - Current situation assessment
   - Overall sentiment and tone
   - Key patterns or notable observations
   - Main takeaways

Format as JSON with keys: key_findings (array of 5 strings), executive_summary (string)"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior media analyst specializing in content analysis."},
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
        print("Usage: python url_sentiment_analyzer.py <urls> [context]")
        print("\nArguments:")
        print("  urls       Required: Single URL or comma-separated URLs")
        print("  context    Optional: Contextual statement for analysis")
        print("\nExamples:")
        print('  python url_sentiment_analyzer.py "https://example.com/article"')
        print('  python url_sentiment_analyzer.py "url1,url2,url3"')
        print('  python url_sentiment_analyzer.py "url1,url2" "Romania election crisis"')
        sys.exit(1)

    url_string = sys.argv[1]
    context = sys.argv[2] if len(sys.argv) > 2 else None

    # Validate environment variables
    if not OPENAI_API_KEY:
        print("❌ Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    print(f"\n🔍 URL Sentiment Analyzer")
    print(f"=" * 60)
    if context:
        print(f"Context: {context}")
    print(f"=" * 60)

    # Parse and validate URLs
    print(f"\n📊 Parsing and validating URLs...")
    valid_urls, invalid_urls = parse_urls(url_string)

    if invalid_urls:
        print(f"\n   ⚠️  Invalid URLs found:")
        for url, error in invalid_urls:
            print(f"      ❌ {url}: {error}")

    if not valid_urls:
        print("❌ No valid URLs to analyze")
        sys.exit(1)

    # Remove duplicates
    unique_urls = list(dict.fromkeys(valid_urls))
    if len(unique_urls) < len(valid_urls):
        print(f"   🔄 Removed {len(valid_urls) - len(unique_urls)} duplicate URLs")

    print(f"\n   ✅ Valid URLs to analyze: {len(unique_urls)}")

    # Analyze each URL
    print(f"\n🕷️  Scraping and analyzing articles...")
    analyses = []

    for i, url in enumerate(unique_urls, 1):
        print(f"\n   [{i}/{len(unique_urls)}] {url}")

        # Scrape content
        scrape_result = scrape_article_content(url)

        if scrape_result['error']:
            print(f"   ❌ {scrape_result['error']}")
            analyses.append({
                "url": url,
                "title": scrape_result['title'],
                "error": scrape_result['error'],
                "analysis": None,
                "news_sentiment": "neutral"
            })
            continue

        title = scrape_result['title']
        content = scrape_result['content']

        print(f"   📄 Title: {title[:70]}...")
        print(f"   📄 Scraped {len(content)} characters")

        # Analyze with AI
        print(f"   🤖 Analyzing...")
        analysis_result = analyze_with_ai(content, title, url, context)

        analyses.append({
            "url": url,
            "title": title,
            **analysis_result
        })

        if analysis_result['error']:
            print(f"   ❌ {analysis_result['error']}")
        else:
            print(f"   ✅ Analysis complete ({analysis_result.get('tokens_used', 0)} tokens)")

    # Calculate sentiment distribution
    sentiment_distribution = {
        "analyzed_urls": len(unique_urls),
        "positive_news": len([a for a in analyses if a.get('news_sentiment') == 'positive' and not a.get('error')]),
        "negative_news": len([a for a in analyses if a.get('news_sentiment') == 'negative' and not a.get('error')]),
        "neutral_news": len([a for a in analyses if a.get('news_sentiment') == 'neutral' and not a.get('error')]),
        "failed_analyses": len([a for a in analyses if a.get('error')])
    }

    # Generate overall summary
    print(f"\n📝 Generating overall summary...")
    overall_summary = generate_overall_summary(analyses, context)

    # Generate key findings and executive summary
    print(f"\n🎯 Generating key findings and executive summary...")
    findings_and_summary = generate_key_findings_and_executive_summary(analyses, sentiment_distribution, context)

    # Output results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Create output directory if it doesn't exist
    output_dir = os.path.join(os.path.dirname(__file__), 'url_analysis')
    os.makedirs(output_dir, exist_ok=True)

    output_file = os.path.join(output_dir, f"analysis_urls_{timestamp}.json")

    output = {
        "source": "direct_urls",
        "input_urls": unique_urls,
        "timestamp": timestamp,
        "context": context,
        "sentiment_distribution": sentiment_distribution,
        "total_analyzed": len(unique_urls),
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
