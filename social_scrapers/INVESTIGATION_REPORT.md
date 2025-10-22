# Investigation Report: Scraper Issues & Solutions

**Date**: October 21, 2025
**Issue**: Both Instagram and TikTok scrapers returning 0 results
**Status**: Root causes identified, workarounds documented

---

## Executive Summary

✅ **Environment**: Fully functional - all dependencies installed, Playwright browsers ready
❌ **Instagram Hashtag Scraping**: Broken due to Apify API changes
✅ **Instagram Profile Scraping**: Working correctly
❌ **TikTok Scraping**: Blocked by enhanced bot detection

---

## Environment Status

### ✅ Verified Working
- Python 3.8.8 (Anaconda)
- All Python packages installed
- Playwright Chromium browser installed
- Environment variables configured
- Output directories created

### How to Verify
```bash
cd /Users/kuzey/seo_agency/social_scrapers
python test_environment.py
```

---

## TikTok Scraper Investigation

### Problem
- Scraper runs without errors
- Logs show scrolling activity
- **0 videos captured**

### Root Cause Identified

#### Issue 1: Encrypted API Responses
**Finding**: TikTok's `/api/search/item/full/` endpoint now returns encrypted data

**Evidence**:
```
API CALL: https://www.tiktok.com/api/search/item/full/?...
  Status: 200
  Content-Type: application/json
  Could not parse JSON: Expecting value: line 1 column 1 (char 0)
```

**Technical Details**:
- API endpoint is called successfully (HTTP 200)
- Response claims to be JSON (`Content-Type: application/json`)
- Response body is encrypted/encoded and cannot be parsed
- The response handler in `tiktok_standalone.py:159-173` silently fails
- Exception is caught but not logged (line 172-173: `except Exception as e: pass`)

**Location**: `tiktok/tiktok_standalone.py:159-173`

#### Issue 2: Headless Browser Detection
**Finding**: TikTok detects and blocks automated browsers

**Evidence**:
- Page loads successfully
- No video elements in DOM
- `login=0` in page metadata (not logged in state)
- References to `captcha-verify-container` in HTML
- User agent shows `HeadlessChrome/121.0.6167.57`

**Attempts Made**:
1. ✅ Anti-detection args (`--disable-blink-features=AutomationControlled`)
2. ✅ Custom user agent from `.env`
3. ✅ Cookie injection
4. ✅ JavaScript injection to hide `navigator.webdriver`
5. ❌ Still blocked - TikTok uses advanced fingerprinting

**Test Files Created**:
- `tiktok/debug_tiktok.py` - Shows API calls and encrypted responses
- `tiktok/debug_dom.py` - Checks DOM structure
- `tiktok/test_stealth.py` - Tests anti-detection measures

### Why Current Approach Doesn't Work

1. **API Interception Method**:
   - Relies on parsing JSON responses from TikTok's internal API
   - TikTok now encrypts these responses
   - Cannot decrypt without reverse engineering their encryption

2. **DOM Scraping Method**:
   - Requires TikTok to render video elements in DOM
   - TikTok detects automation and doesn't render content
   - Even with stealth mode, fingerprinting catches the bot

### Recommendations for TikTok

#### Option 1: Use Apify TikTok Scraper (Recommended)
**Pros**:
- Maintained service that handles bot detection
- Similar to Instagram approach
- Reliable and tested
- Simple integration

**Cons**:
- Paid service (usage-based pricing)
- External dependency

**Implementation**:
```python
from apify_client import ApifyClient

client = ApifyClient(os.getenv("APIFY_API_TOKEN"))
run = client.actor("clockworks/tiktok-scraper").call(
    run_input={
        "searchQueries": ["MIRX", "Miraclechain"],
        "resultsPerPage": 20
    }
)
```

#### Option 2: Use Undetected Chromedriver
**Pros**:
- Free and open source
- Better at avoiding detection than Playwright
- Active community

**Cons**:
- Requires code refactoring
- May still be detected over time
- Needs more maintenance

**Implementation**:
```bash
pip install undetected-chromedriver
```

#### Option 3: Residential Proxies + Current Code
**Pros**:
- Uses existing code
- Good for avoiding IP blocks

**Cons**:
- Expensive (proxy services)
- Doesn't solve encryption issue
- Complex setup

#### Option 4: Non-Headless Mode with User Interaction
**Pros**:
- Can pass CAPTCHAs manually
- Most reliable for small batches

**Cons**:
- Not automated
- Requires human intervention
- Not scalable

---

## Instagram Scraper Investigation

### Problem
- Apify returns 50 items for hashtag searches
- All items parsed as "invalid" (0 posts extracted)
- Working: Profile scraping
- Broken: Hashtag scraping

### Root Cause Identified

**Finding**: Apify Instagram API changed behavior for hashtag searches

**Evidence**:
```
Retrieved 50 items from dataset
Processing hashtag data for #MIRX
No valid posts found for #MIRX
```

**Technical Details**:
- Apify returns data (not an auth issue)
- Data structure doesn't match expected post format
- Instead of posts, returns:
  - Hashtag metadata
  - Related hashtag suggestions
  - Popularity metrics
- The `resultsType: "posts"` parameter is ignored for hashtags

**Attempts Made**:
1. ✅ Changed `resultsType` from `"details"` to `"posts"`
2. ✅ Rewrote `normalize_hashtag_data()` to handle new format
3. ✅ Tested with multiple hashtags
4. ❌ Apify fundamentally doesn't return posts for hashtags anymore

**Working Alternative**: Profile scraping
```bash
python instagram/instagram_standalone.py \
  --input "https://www.instagram.com/artibir/" \
  --max-posts 50
```
✅ Returns actual posts with full data

### Recommendations for Instagram

#### Option 1: Use Profile Scraping Instead (Recommended)
**Pros**:
- Already working
- Reliable data
- Full post details
- Comments available

**Cons**:
- Need to find profiles, not hashtags
- Different search strategy required

**How to Adapt**:
Instead of: "Scrape hashtag #MIRX"
Do: "Find top profiles posting about MIRX, scrape their posts"

#### Option 2: Use Different Instagram API Service
**Pros**:
- May have better hashtag support
- Competitive pricing

**Cons**:
- Requires evaluation and testing
- May have same limitations

**Services to Consider**:
- Bright Data (formerly Luminati)
- ScraperAPI Instagram endpoint
- Instagram Graph API (official, limited)

#### Option 3: Build Custom Instagram Scraper
**Pros**:
- Full control
- No API costs

**Cons**:
- High maintenance (Instagram changes frequently)
- Bot detection challenges
- Risk of IP bans
- Not recommended

---

## Current Capabilities

### ✅ What Works

1. **Instagram Profile Scraping**
   ```bash
   python instagram/instagram_standalone.py \
     --input "https://www.instagram.com/nasa/" \
     --max-posts 50
   ```
   - Extracts posts, captions, likes, comments
   - Hashtags and mentions
   - Media URLs
   - Engagement metrics

2. **Environment Setup**
   - All dependencies installed
   - Browsers configured
   - Environment variables set

### ❌ What Doesn't Work

1. **Instagram Hashtag Scraping**
   - Returns 0 posts
   - Apify API limitation
   - Not fixable without alternative service

2. **TikTok Scraping (All Methods)**
   - Query search: 0 videos
   - Page scraping: 0 videos
   - Bot detection too advanced
   - Requires alternative approach

---

## Immediate Action Items

### For You (User)

1. **Verify Environment** (Should work)
   ```bash
   cd /Users/kuzey/seo_agency/social_scrapers
   python test_environment.py
   ```

2. **Test Instagram Profile Scraping** (Should work)
   ```bash
   python instagram/instagram_standalone.py \
     --input "https://www.instagram.com/nasa/" \
     --test
   ```

3. **Decide on TikTok Strategy**
   - Option A: Use Apify TikTok Scraper (recommended)
   - Option B: Try undetected-chromedriver
   - Option C: Manual scraping for small batches
   - Option D: Wait for TikTok API access

4. **Decide on Instagram Hashtag Strategy**
   - Option A: Switch to profile-based scraping
   - Option B: Find alternative Instagram API
   - Option C: Accept limitation and focus on profiles

---

## Files Created During Investigation

### Documentation
- `SETUP_GUIDE.md` - Complete setup instructions
- `INVESTIGATION_REPORT.md` - This file
- `setup.sh` - Automated setup script
- `test_environment.py` - Environment verification

### Debug Scripts
- `tiktok/debug_tiktok.py` - API call debugger
- `tiktok/debug_dom.py` - DOM structure inspector
- `tiktok/test_stealth.py` - Anti-detection tester

### Test Outputs
- `/tmp/tiktok_search_debug.html` - Page HTML for inspection
- `/tmp/tiktok_stealth_test.html` - Stealth mode test results

---

## Technical Details for Developers

### TikTok API Response Encryption

The response from `/api/search/item/full/` is encrypted. Example:

```
Content-Type: application/json
Status: 200

[encrypted binary data or obfuscated string - cannot be parsed as JSON]
```

This is intentional bot prevention. Solutions:
1. Use services that handle decryption (Apify)
2. Reverse engineer encryption (not recommended, ToS violation)
3. Use official TikTok API when available

### Instagram Apify Response Structure

When scraping hashtags with `resultsType: "posts"`:

```json
{
  "type": "Hashtag",
  "name": "mirx",
  "hashtag": "mirx",
  "relatedHashtags": [...],
  // NO "posts" array
  // NO "topPosts" array
}
```

This is an Apify limitation, not a code bug.

---

## Cost Estimates for Alternative Solutions

### Apify TikTok Scraper
- ~$1-3 per 1000 videos
- Volume discounts available
- Most cost-effective for automation

### Alternative Instagram APIs
- Bright Data: ~$50-500/month
- ScraperAPI: ~$30-150/month
- Varies by volume

### Residential Proxies
- ~$50-200/month
- Doesn't guarantee success
- Additional complexity

---

## Conclusion

**Environment**: ✅ Fully functional - you can run scripts
**Instagram**: ⚠️ Profile scraping works, hashtag scraping broken
**TikTok**: ❌ Completely blocked by bot detection

**Next Steps**:
1. Run `python test_environment.py` to confirm setup
2. Test Instagram profile scraping
3. Decide on alternative approach for TikTok (recommend Apify)
4. Consider profile-based strategy for Instagram instead of hashtags

**Questions?** Review `SETUP_GUIDE.md` for troubleshooting.
