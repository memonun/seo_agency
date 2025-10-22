# Social Scrapers - Setup Guide

## Environment Setup

### Current Environment
- Python: 3.8.8 (Anaconda base)
- Location: `/Users/kuzey/opt/anaconda3/bin/python`

### Step 1: Install Python Dependencies

```bash
cd /Users/kuzey/seo_agency/social_scrapers

# Install all required packages
pip install -r requirements.txt
```

### Step 2: Install Playwright Browser Binaries

**This is the critical step that's often missed!**

```bash
# Install Playwright browsers (Chromium, Firefox, WebKit)
python -m playwright install

# Or install only Chromium (recommended for our scrapers)
python -m playwright install chromium
```

### Step 3: Verify Installation

```bash
# Test Playwright installation
python -c "from playwright.sync_api import sync_playwright; print('✅ Playwright OK')"

# Test async Playwright
python -c "import asyncio; from playwright.async_api import async_playwright; print('✅ Async Playwright OK')"
```

### Step 4: Verify Environment Variables

```bash
# Check .env file exists
ls -la .env

# Verify required variables (don't print values!)
python -c "
from dotenv import load_dotenv
import os
load_dotenv()
required = ['APIFY_API_TOKEN', 'TIKTOK_COOKIE', 'TIKTOK_USER_AGENT']
for var in required:
    status = '✅' if os.getenv(var) else '❌'
    print(f'{status} {var}')
"
```

## Running the Scrapers

### Instagram Standalone Scraper

**Note**: Currently, hashtag scraping via Apify is not working (returns 0 posts). Profile scraping works fine.

```bash
# Test with a profile (WORKS)
python instagram/instagram_standalone.py --input "https://www.instagram.com/nasa/" --test

# Test with hashtag (CURRENTLY BROKEN)
python instagram/instagram_standalone.py --input "travel" --max-posts 50
```

### TikTok Standalone Scraper

**Note**: Currently experiencing issues due to TikTok's enhanced bot detection. The scraper runs but returns 0 videos.

```bash
# Test with a query
python tiktok/tiktok_standalone.py --input "cat" --max-videos 20 --max-pages 3
```

## Known Issues

### Issue 1: TikTok Scraper Returns 0 Videos

**Symptoms**:
- Script runs without errors
- Logs show "Scrolled X times, found 0 videos"
- Output JSON has 0 videos

**Root Cause**:
1. TikTok's API responses are now encrypted (cannot parse JSON)
2. TikTok detects headless browser automation
3. DOM doesn't render video content for automated browsers

**Debug Steps**:
```bash
# Run debug script to see API calls
python tiktok/debug_tiktok.py

# Test with stealth mode
python tiktok/test_stealth.py
```

**Potential Solutions**:
- Use Apify TikTok Scraper (paid service)
- Use undetected-chromedriver instead of Playwright
- Run in non-headless mode with user interaction
- Use residential proxies

### Issue 2: Instagram Hashtag Scraping Returns 0 Posts

**Symptoms**:
- Apify returns data (50 items)
- But 0 valid posts extracted
- Returns related hashtag suggestions instead

**Root Cause**:
- Apify Instagram API changed behavior for hashtag searches
- `resultsType: "posts"` no longer returns actual posts for hashtags

**Workaround**:
- Use profile scraping instead (works reliably)
- Switch to different Instagram API provider

## Troubleshooting

### "playwright._impl._api_types.Error: Executable doesn't exist"

**Solution**: Install browser binaries
```bash
python -m playwright install chromium
```

### "ModuleNotFoundError: No module named 'playwright'"

**Solution**: Install Playwright
```bash
pip install playwright==1.41.0
```

### "TIKTOK_COOKIE not found in environment variables"

**Solution**: Create or update `.env` file
```bash
# Make sure .env file exists in project root
ls -la .env

# Check if it has the required variables
cat .env | grep TIKTOK
```

### Scripts run but return 0 results

**For TikTok**:
- This is a known issue due to bot detection (see Issue 1 above)
- Not an environment problem

**For Instagram**:
- Hashtag scraping is broken by Apify (see Issue 2 above)
- Try profile scraping instead

## Testing Your Setup

Run this complete test:

```bash
cd /Users/kuzey/seo_agency/social_scrapers

# 1. Test Python imports
python -c "
import sys
print(f'Python: {sys.version}')
print(f'Path: {sys.executable}')

try:
    from playwright.async_api import async_playwright
    print('✅ Playwright async OK')
except Exception as e:
    print(f'❌ Playwright async: {e}')

try:
    from apify_client import ApifyClient
    print('✅ Apify client OK')
except Exception as e:
    print(f'❌ Apify client: {e}')

try:
    import pandas as pd
    print('✅ Pandas OK')
except Exception as e:
    print(f'❌ Pandas: {e}')

try:
    from dotenv import load_dotenv
    print('✅ Python-dotenv OK')
except Exception as e:
    print(f'❌ Python-dotenv: {e}')
"

# 2. Test Instagram profile scraping (should work)
echo -e "\n\n=== Testing Instagram Profile Scraping ==="
python instagram/instagram_standalone.py --input "https://www.instagram.com/nasa/" --test

# 3. Check output
echo -e "\n\n=== Checking Output ==="
ls -lh outputs/instagram/ | tail -5
```

## Getting Help

If you're still having issues:

1. Check the error message carefully
2. Verify all environment variables are set
3. Confirm Playwright browsers are installed: `python -m playwright install chromium`
4. Check Python version: `python --version` (should be 3.8+)
5. Review the debug logs in the output JSON files
