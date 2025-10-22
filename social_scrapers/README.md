# Social Media Scrapers

Production-ready scrapers for Instagram and TikTok social media platforms. These scrapers extract data from social media and normalize it to Supabase database schema (`social_analytics`).

## 📋 Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Quick Start](#quick-start)
- [Database-Connected Scrapers](#scrapers)
  - [Instagram Scraper](#instagram-scraper)
  - [TikTok Page Scraper](#tiktok-page-scraper)
  - [TikTok Query Scraper](#tiktok-query-scraper)
  - [TikTok Comment Scraper](#tiktok-comment-scraper)
- [Standalone Scrapers](#-standalone-scrapers)
  - [Instagram Standalone](#instagram-standalone)
  - [TikTok Standalone](#tiktok-standalone)
  - [When to Use Standalone vs Database-Connected](#when-to-use-standalone-vs-database-connected)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This project contains **two types of scrapers**:

### 📊 Database-Connected Scrapers (4 scrapers)

Production scrapers that integrate with Supabase database:

| Scraper | Platform | Purpose | Database Tables |
|---------|----------|---------|-----------------|
| **Instagram Scraper** | Instagram | Scrapes hashtags & profile posts via Apify API | `instagram_hashtags`, `instagram_posts` |
| **TikTok Page** | TikTok | Scrapes videos from TikTok profile pages | `tiktok_pages` |
| **TikTok Query** | TikTok | Scrapes videos from TikTok search queries | `tiktok_queries` |
| **TikTok Comment** | TikTok | Scrapes comments for specific videos | `tiktok_comments`, `tiktok_commenters` |

These scrapers:
- Connect to Supabase (`social_analytics` schema)
- Use batch_id for tracking scraping sessions
- Support CLI arguments for automation
- Include comprehensive error handling
- Fetch brand configuration from `brands` table

### 🚀 Standalone Scrapers (2 scrapers)

Lightweight parameter-based scrapers that output to JSON:

| Scraper | Platform | Purpose | Output |
|---------|----------|---------|--------|
| **Instagram Standalone** | Instagram | Scrape any hashtag or profile by direct input | JSON file |
| **TikTok Standalone** | TikTok | Scrape any page or query with automatic comments | JSON file |

These scrapers:
- Accept direct input parameters (no database needed)
- Output results to JSON files
- Automatically scrape comments (TikTok)
- Ideal for quick data extraction and testing
- No Supabase configuration required

---

## 📁 Directory Structure

```
social_scrapers/
├── instagram/
│   ├── instagram_scraper.py          # DB-connected Instagram scraper
│   ├── instagram_standalone.py       # ⭐ Standalone Instagram scraper (parameter-based)
│   └── outputs/                       # DB scraper outputs
│
├── tiktok/
│   ├── tiktok_page.py                # DB-connected profile scraper
│   ├── tiktok_query.py               # DB-connected query scraper
│   ├── tiktok_comment.py             # DB-connected comment scraper
│   ├── tiktok_standalone.py          # ⭐ Standalone TikTok scraper (unified, parameter-based)
│   ├── storage_state.json            # Playwright auth (auto-generated)
│   └── outputs/                       # DB scraper outputs
│
├── outputs/                           # ⭐ Standalone scraper JSON outputs
│   ├── instagram/                     # Instagram standalone results
│   └── tiktok/                        # TikTok standalone results
│
├── .env                               # Environment variables (REQUIRED)
├── .env.example                       # Template for .env
├── requirements.txt                   # Python dependencies
├── .gitignore                         # Git ignore rules
└── README.md                          # This file
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd social_scrapers
pip install -r requirements.txt
playwright install  # Required for TikTok scrapers
```

### 2. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

**Required credentials:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `APIFY_API_TOKEN` - Apify API token (for Instagram)
- `TIKTOK_COOKIE` - TikTok authentication cookie (for TikTok)
- `TIKTOK_COMMENTS_BASEQS` - TikTok API query string (for comments)
- `TIKTOK_USER_AGENT` - Browser user agent

### 3. Run a Scraper

**Standalone Scrapers (Quick Start - No DB needed):**

```bash
# Instagram standalone - scrape any hashtag or profile
cd instagram
python instagram_standalone.py --input "#music" --test
python instagram_standalone.py --input "https://www.instagram.com/nasa/"

# TikTok standalone - scrape any page or query (with auto-comments)
cd tiktok
python tiktok_standalone.py --input "https://www.tiktok.com/@user" --max-videos 10
python tiktok_standalone.py --input "funny cats" --max-videos 10
```

**Database-Connected Scrapers (Production):**

```bash
# Instagram - scrape hashtags and profiles from DB brands
cd instagram
python instagram_scraper.py --brand tuborg --type both

# TikTok Page - scrape profile videos from DB brands
cd tiktok
python tiktok_page.py --brand tuborg --sub-brands yuzdeyuzmuzik

# TikTok Query - scrape search results from DB brands
python tiktok_query.py --brand tuborg --sub-brands all

# TikTok Comment - scrape video comments
python tiktok_comment.py --brand tuborg --video-ids 123456,789012
```

---

## 📱 Scrapers

### Instagram Scraper

**Purpose:** Scrapes Instagram hashtags and profile posts using Apify API, then normalizes the data for Supabase.

**Database Tables:**
- `social_analytics.instagram_hashtags` - Hashtag data with top/latest posts
- `social_analytics.instagram_posts` - Individual post details

**Features:**
- Scrapes both hashtags and profile posts
- Normalizes Apify data to database schema
- Handles NaN values and nested JSON
- Supports multiple sub-brands
- Test mode for development

**Usage:**

```bash
cd instagram

# Test mode (5 results per scrape)
python instagram_scraper.py --test

# Scrape specific brand
python instagram_scraper.py --brand tuborg

# Scrape specific sub-brand
python instagram_scraper.py --brand tuborg --sub-brand yuzdeyuzmuzik

# Scrape only hashtags
python instagram_scraper.py --brand tuborg --type hashtag

# Scrape only profiles
python instagram_scraper.py --brand tuborg --type profile
```

**CLI Arguments:**
- `--test` - Test mode (limits results to 5)
- `--brand` - Brand name from database
- `--sub-brand` - Specific sub-brand to scrape
- `--type` - Scrape type: `hashtag`, `profile`, or `both` (default)

**Output:** Data inserted directly into Supabase tables.

---

### TikTok Page Scraper

**Purpose:** Scrapes videos from TikTok profile pages using Playwright browser automation.

**Database Table:** `social_analytics.tiktok_pages`

**Features:**
- Uses Playwright for browser automation
- Scrolls page to load more videos
- Captures API responses during scroll
- Calculates engagement metrics
- Supports multiple profiles

**Usage:**

```bash
cd tiktok

# Interactive mode
python tiktok_page.py

# Scrape specific brand
python tiktok_page.py --brand tuborg

# Scrape specific sub-brands
python tiktok_page.py --brand tuborg --sub-brands yuzdeyuzmuzik,yuzdeyuzmetal

# Scrape all sub-brands
python tiktok_page.py --brand tuborg --sub-brands all

# Custom batch ID
python tiktok_page.py --brand tuborg --batch-id my-batch-123

# Dry run (preview without scraping)
python tiktok_page.py --brand tuborg --dry-run
```

**CLI Arguments:**
- `--brand` - Brand name
- `--sub-brands` - Comma-separated sub-brand list or `all`
- `--batch-id` - Custom batch ID (default: auto-generated UUID)
- `--dry-run` - Preview without scraping

**Output:** Data inserted into `tiktok_pages` table + saved to `outputs/`

---

### TikTok Query Scraper

**Purpose:** Scrapes videos from TikTok search queries using Playwright.

**Database Table:** `social_analytics.tiktok_queries`

**Features:**
- Builds search URLs from queries
- Captures API responses for search results
- Calculates engagement rates
- Supports multiple queries per brand
- Automatic batch counter management

**Usage:**

```bash
cd tiktok

# Interactive mode
python tiktok_query.py

# Scrape specific brand queries
python tiktok_query.py --brand tuborg

# Scrape specific sub-brands
python tiktok_query.py --brand tuborg --sub-brands yuzdeyuzmuzik

# Limit videos scraped
python tiktok_query.py --brand tuborg --max-videos 100

# Dry run
python tiktok_query.py --brand tuborg --dry-run
```

**CLI Arguments:**
- `--brand` - Brand name
- `--sub-brands` - Comma-separated sub-brand list or `all`
- `--batch-id` - Custom batch ID
- `--max-videos` - Maximum videos to scrape (default: 200)
- `--dry-run` - Preview without scraping
- `--no-cleanup` - Don't clean up old queries

**Output:** Data inserted into `tiktok_queries` table

---

### TikTok Comment Scraper

**Purpose:** Scrapes comments for specific TikTok videos using TikTok API.

**Database Tables:**
- `social_analytics.tiktok_comments` - Video comments
- `social_analytics.tiktok_commenters` - Commenter profiles
- `social_analytics.tiktok_comment_crawl_state` - Crawl resume state

**Features:**
- Uses TikTok API with cookies
- Retry logic with exponential backoff
- Saves crawl state for resuming
- Upserts commenter information
- Rate limiting protection

**Usage:**

```bash
cd tiktok

# Scrape comments for specific video IDs
python tiktok_comment.py --brand tuborg --video-ids 123456,789012

# Scrape with custom batch ID
python tiktok_comment.py --brand tuborg --video-ids 123456 --batch-id abc-123

# Limit pages per video
python tiktok_comment.py --brand tuborg --video-ids 123456 --max-pages 10
```

**CLI Arguments:**
- `--brand` - Brand name
- `--video-ids` - Comma-separated video IDs
- `--batch-id` - Custom batch ID
- `--max-pages` - Maximum pages per video (default: 5)

**Output:** Comments and commenters inserted into respective tables

---

## 🚀 Standalone Scrapers

### Instagram Standalone

**Purpose:** Scrape any Instagram hashtag or profile by direct input, output to JSON.

**Features:**
- No database required - only needs Apify API token
- Auto-detects input type (hashtag vs profile URL)
- Outputs to JSON file with complete metadata
- Test mode for quick trials
- Configurable post limits

**Usage:**

```bash
cd instagram

# Scrape a hashtag
python instagram_standalone.py --input "#music"
python instagram_standalone.py --input "music"  # # is optional

# Scrape a profile
python instagram_standalone.py --input "https://www.instagram.com/nasa/"

# With options
python instagram_standalone.py --input "#music" --max-posts 100
python instagram_standalone.py --input "nasa" --type profile --test
python instagram_standalone.py --input "#music" --output ./my_results/
```

**CLI Arguments:**
- `--input` (required) - Hashtag or profile URL
- `--type` - Explicitly specify 'hashtag' or 'profile' (optional, auto-detected)
- `--max-posts` - Maximum posts to scrape (default: 200)
- `--test` - Test mode (limit to 5 posts)
- `--output` - Custom output directory (default: outputs/instagram/)

**Output Example:**
```json
{
  "input": {
    "type": "hashtag",
    "value": "music",
    "scraped_at": "2025-10-19T10:30:00"
  },
  "metadata": {
    "total_posts": 150,
    "scrape_duration_seconds": 45.2
  },
  "results": {
    "hashtag_data": {
      "hashtag_name": "#music",
      "posts_count": 150,
      "latest_posts": [...],
      "top_posts": [...],
      "total_engagement": 50000,
      "avg_engagement": 333.3
    }
  }
}
```

---

### TikTok Standalone

**Purpose:** Scrape any TikTok page or search query with automatic comment scraping, output to JSON.

**Features:**
- No database required - only needs TikTok cookies
- Auto-detects input type (page URL vs search query)
- **Automatically scrapes comments** for all videos found
- Unified scraper for both pages and queries
- Outputs comprehensive JSON with videos and comments
- Configurable limits for videos and comment pages

**Usage:**

```bash
cd tiktok

# Scrape a TikTok page
python tiktok_standalone.py --input "https://www.tiktok.com/@charlidamelio"

# Scrape a search query
python tiktok_standalone.py --input "funny cats"

# With options
python tiktok_standalone.py --input "@user" --max-videos 20
python tiktok_standalone.py --input "music" --no-comments  # Skip comments
python tiktok_standalone.py --input "dance" --max-pages 10  # More comments per video
python tiktok_standalone.py --input "@user" --output ./my_results/
```

**CLI Arguments:**
- `--input` (required) - TikTok page URL or search query
- `--max-videos` - Maximum videos to scrape (default: 50)
- `--no-comments` - Skip comment scraping
- `--max-pages` - Maximum comment pages per video (default: 5)
- `--output` - Custom output directory (default: outputs/tiktok/)

**Output Example:**
```json
{
  "input": {
    "type": "query",
    "value": "funny cats",
    "scraped_at": "2025-10-19T10:30:00"
  },
  "metadata": {
    "total_videos": 50,
    "total_comments": 1500,
    "scrape_duration_seconds": 120.5
  },
  "videos": [
    {
      "video_id": "123456",
      "desc": "Funny cat video",
      "author": {...},
      "stats": {
        "play_count": 10000,
        "digg_count": 500,
        "comment_count": 30,
        "engagement_rate": 5.3
      }
    }
  ],
  "comments": {
    "123456": {
      "video_id": "123456",
      "total_comments": 30,
      "comments": [
        {
          "comment_id": "789",
          "text": "So funny!",
          "user": {...},
          "like_count": 10
        }
      ]
    }
  }
}
```

---

### When to Use Standalone vs Database-Connected

**Use Standalone Scrapers when:**
- Quick one-off data extraction needed
- Testing or exploring content
- No database infrastructure available
- Working with arbitrary hashtags/pages/queries
- Prefer JSON output for further processing

**Use Database-Connected Scrapers when:**
- Running production brand monitoring
- Need scheduled/automated scraping
- Tracking changes over time with batch IDs
- Integrating with existing analytics pipeline
- Using brand configuration management

---

## 🔐 Environment Variables

All scrapers use a consolidated `.env` file in the `social_scrapers/` directory.

### Required Variables

```bash
# ── Supabase Configuration (Shared by all scrapers) ──
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# ── Instagram Scraper Configuration ──
APIFY_API_TOKEN=apify_api_your_token_here

# ── TikTok Scraper Configuration ──
TIKTOK_USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36..."
TIKTOK_COOKIE="your_tiktok_cookie_here"
TIKTOK_COMMENTS_BASEQS="WebIdLastTime=1751032115&aid=1988&..."

# ── Optional ──
LOG_LEVEL=INFO
```

### Where to Get Credentials

**Supabase:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **service_role** key (NOT anon key)

**Apify:**
1. Go to https://console.apify.com/account/integrations
2. Generate API token

**TikTok Cookie & Query String:**
1. Open TikTok in browser
2. Open DevTools (F12) → Network tab
3. Browse TikTok and find API requests
4. Copy cookie from request headers
5. Copy query string from comment API requests

---

## 🗄️ Database Schema

All scrapers write to the `social_analytics` schema in Supabase.

### Tables

**Instagram:**
- `instagram_hashtags` - Hashtag statistics with sample posts
- `instagram_posts` - Individual Instagram posts

**TikTok:**
- `tiktok_pages` - Videos from profile pages
- `tiktok_queries` - Videos from search queries
- `tiktok_comments` - Video comments
- `tiktok_commenters` - Commenter profiles
- `tiktok_comment_crawl_state` - Crawl resume state

**Shared:**
- `brands` - Brand and sub-brand configuration (source of truth)

### Brand Configuration

All scrapers fetch configuration from the `brands` table:

```json
{
  "id": 1,
  "name": "tuborg",
  "is_active": true,
  "sub_brands": {
    "yuzdeyuzmuzik": {
      "hashtags": ["#yuzdeyuzmuzik", "#100muzik"],
      "instagram": {
        "username": "yuzdeyuzmuzik",
        "url": "https://www.instagram.com/yuzdeyuzmuzik/"
      },
      "tiktok": {
        "username": "yuzdeyuzmuzik",
        "url": "https://www.tiktok.com/@yuzdeyuzmuzik"
      },
      "tiktok_query": "yuzdeyuzmuzik"
    }
  }
}
```

---

## 🐛 Troubleshooting

### Common Issues

**1. "SUPABASE_URL not set"**
- Check `.env` file exists in `social_scrapers/` directory
- Ensure variables are not commented out
- No spaces around `=` sign

**2. "No results found for brand"**
- Check brand name spelling in database
- Ensure `is_active = true` in brands table
- Verify sub_brands JSON structure

**3. "Playwright browser not found"**
```bash
playwright install
```

**4. "TikTok Cookie expired"**
- TikTok cookies expire regularly
- Update `TIKTOK_COOKIE` in `.env`
- Update `TIKTOK_COMMENTS_BASEQS` as well

**5. "Apify quota exceeded"**
- Check Apify dashboard for usage
- Upgrade Apify plan or wait for reset
- Use `--test` mode for development

**6. Scraping returns 0 results**
- Instagram: Check Apify actor is working
- TikTok: Check if page structure changed
- Verify network connectivity

### Debug Mode

Enable detailed logging:

```bash
# Instagram
LOG_LEVEL=DEBUG python instagram_scraper.py --test

# TikTok
# Already has detailed logging enabled
```

### Getting Help

1. Check logs for detailed error messages
2. Verify environment variables are set correctly
3. Test database connection separately
4. Ensure brand configuration is correct in database

---

## 📊 Output Examples

**Instagram Hashtag Output:**
- Latest posts (JSON array)
- Top posts (JSON array)
- Engagement metrics
- Unique users count

**TikTok Page Output:**
- Video metadata
- Engagement metrics (likes, comments, shares)
- Hashtags and mentions
- Music information

**TikTok Query Output:**
- Search result videos
- Engagement rates
- Query metadata

**TikTok Comment Output:**
- Comment text and metadata
- Commenter profiles
- Reply structure
- Like counts

---

## 🔒 Security Notes

- **Never commit `.env` file** - Contains sensitive credentials
- **Use service_role key carefully** - Has full database access
- **Rotate TikTok cookies regularly** - Expire after some time
- **Monitor Apify usage** - Avoid unexpected charges
- **Keep storage_state.json private** - Contains session data

---

## 📝 License

Part of the SEO Agency project.

---

## 🤝 Contributing

These are production scrapers. Changes should be minimal and thoroughly tested.

**Before modifying:**
1. Test in `--test` mode or `--dry-run`
2. Verify database schema compatibility
3. Check brand configuration format
4. Ensure backward compatibility

---

## 📞 Support

For issues or questions:
1. Check this README first
2. Review error logs
3. Verify environment configuration
4. Test with `--dry-run` or `--test` modes
