# Social Listening Module - Implementation Guide

## 🎯 Overview

Social Listening Module for Instagram and TikTok monitoring with **Job Queue Pattern** (NO automatic scheduling/cron).

**Key Principle**: User has full control - scraping happens only when YOU trigger it.

---

## ✅ Completed Phases

### Phase 1: Database & API Foundation
- ✅ **Database Schema** (`/database/social_listening_schema.sql`)
  - Job queue table for manual triggers
  - Campaigns, mentions, trends, influencers, alerts
  - RLS policies for security
  - Helper functions for progress tracking

- ✅ **API Endpoints** (Dual Environment)
  - `/api/social-listening.js` (Vercel serverless)
  - `/server/index.js` (Express development)
  - Both environments identical functionality

### Phase 2.1: Instagram Scraper ✅
- ✅ **Instagram Scraper** (`/src/utils/socialListening/scrapers/instagram.js`)
  - Ported from Python reference code
  - Uses Apify SDK for Instagram scraping
  - Hashtag scraping support
  - Profile scraping support
  - Data normalization to database schema

### Phase 2.2: TikTok Scraper ✅
- ✅ **TikTok Scraper** (`/src/utils/socialListening/scrapers/tiktok.js`)
  - **IQ 213 Decision**: Uses Apify SDK instead of Playwright
  - **Why**: Serverless-friendly (no 200MB Chromium bundle)
  - Hashtag scraping support
  - Profile scraping support
  - Search query scraping support
  - Data normalization to database schema
  - TikTok-specific fields: music, duets, stitches, engagement metrics

- ✅ **Job Worker** (`/src/utils/socialListening/workers/jobWorker.js`)
  - Processes jobs from queue for BOTH platforms
  - Instagram + TikTok integration
  - Updates progress in real-time
  - Saves results to database
  - Error handling and retry logic

- ✅ **Process Jobs Trigger** (`/src/utils/socialListening/workers/processJobs.js`)
  - Entry point for job processing
  - Can be called from API or CLI

---

## 🚀 How to Use

### 1. Create a Campaign

```bash
curl -X POST http://localhost:3001/api/social-listening \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create-campaign",
    "user_id": "your-user-id",
    "name": "My Brand Monitoring",
    "description": "Monitor mentions of my brand on Instagram",
    "hashtags": ["mybrand", "myproduct"],
    "platforms": {
      "instagram": true,
      "tiktok": false
    },
    "instagram_config": {
      "profile_url": "https://www.instagram.com/yourbrand/",
      "max_posts_per_scrape": 200
    }
  }'
```

### 2. Start a Scrape Job

```bash
curl -X POST http://localhost:3001/api/social-listening \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start-scrape",
    "campaign_id": "campaign-uuid",
    "user_id": "your-user-id",
    "platforms": ["instagram"]
  }'
```

Response:
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "status": "queued",
    "progress": {
      "current": 0,
      "total": 0,
      "message": "Job queued, waiting to start..."
    }
  }
}
```

### 3. Trigger Job Processing

**Manual trigger** (you decide when to process):

```bash
curl -X POST http://localhost:3001/api/social-listening \
  -H "Content-Type: application/json" \
  -d '{
    "action": "process-jobs"
  }'
```

### 4. Check Job Status

Poll for progress updates:

```bash
curl "http://localhost:3001/api/social-listening?action=get-job-status&job_id=job-uuid"
```

Response (in progress):
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "status": "running",
    "progress": {
      "current": 2,
      "total": 5,
      "message": "Scraping hashtag: #mybrand"
    }
  }
}
```

Response (completed):
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "status": "completed",
    "items_scraped": 150,
    "results": {
      "platforms": {
        "instagram": {
          "mentions_found": 150,
          "mentions_saved": 150,
          "errors": []
        }
      }
    }
  }
}
```

### 5. Get Mentions

```bash
curl "http://localhost:3001/api/social-listening?action=get-mentions&campaign_id=campaign-uuid&platform=instagram&limit=50"
```

---

## 📁 File Structure

```
/src/utils/socialListening/
├── README.md                           # This file
├── scrapers/
│   ├── instagram.js                    # ✅ Instagram scraper (Apify SDK)
│   └── tiktok.js                       # ✅ TikTok scraper (Apify SDK)
├── workers/
│   ├── jobWorker.js                    # ✅ Job processing worker (Instagram + TikTok)
│   └── processJobs.js                  # ✅ Entry point for job processing
├── filters/
│   └── relevanceFilter.js              # ✅ AI relevance filtering (built by other dev)
├── sentiment/
│   └── sentimentAnalyzer.js            # ✅ Multi-model sentiment (built by other dev)
└── analytics/
    ├── trendDetector.js                # ⏳ Trend detection (Phase 4)
    └── influencerScorer.js             # ⏳ Influencer scoring (Phase 4)

/database/
└── social_listening_schema.sql         # ✅ Complete database schema

/api/
└── social-listening.js                 # ✅ Vercel serverless function

/server/
└── index.js                            # ✅ Express routes (DUAL ENV)
```

---

## 🔧 Environment Variables Required

```bash
# Supabase
VITE_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Apify (for Instagram scraping)
APIFY_API_TOKEN=your-apify-token

# OpenAI (for relevance filtering & sentiment - Phase 3)
OPENAI_API_KEY=your-openai-key

# Google Gemini (for sentiment analysis - Phase 3)
GOOGLE_API_KEY=your-google-api-key
```

---

## 🏗️ Architecture Patterns

### Job Queue Pattern (No Cron)

**Why No Cron?**
- User wants full control over when scraping happens
- Avoid wasting API credits on automatic scraping
- Manual trigger = deliberate action when needed

**How It Works:**

1. **User clicks "Scrape Now"** → Creates job with `status: 'queued'`
2. **User calls `process-jobs`** → Worker picks up queued jobs
3. **Worker processes** → Updates `progress` in real-time
4. **User polls `get-job-status`** → Gets live updates
5. **Job completes** → Results saved, status = `completed`

### Dual Environment Consistency

Every feature works identically in BOTH:
- **Production**: Vercel serverless (`/api/social-listening.js`)
- **Development**: Express server (`/server/index.js`)

Benefits:
- Develop locally without deploying
- Same API, same responses, same behavior
- No surprises when deploying

---

## 🧠 IQ 213 Architecture Decision: Apify vs Playwright

### The Challenge
The Python reference code uses **Playwright** (headless Chromium browser) for TikTok scraping. This works great locally but has critical issues for serverless:

**Playwright Problems:**
- 📦 Bundle size: ~200MB (Chromium binary)
- 🚫 Vercel limit: 50MB max
- ⏱️ Cold start: 5-10 seconds (timeout risk)
- 💰 Cost: More expensive Lambda instances needed
- 🔧 Maintenance: Complex browser updates

### The IQ 213 Solution
Use **Apify SDK** for both Instagram AND TikTok! 🎯

**Why This Is Superior:**

1. **Consistency** ✅
   - Same SDK for both platforms
   - Same patterns, same error handling
   - Easier to maintain and debug

2. **Serverless-Friendly** ✅
   - No browser binaries
   - Small bundle size (~5MB)
   - Fast cold starts
   - Works perfectly in Vercel

3. **Reliability** ✅
   - Apify handles anti-scraping measures
   - Automatic proxy rotation
   - Built-in rate limiting
   - Professional support

4. **Cost-Effective** ✅
   - Shared infrastructure
   - Pay per use
   - No idle browser instances
   - Predictable costs

5. **Developer Experience** ✅
   - Simple API
   - Great documentation
   - Active community
   - Regular updates

### Trade-offs
**What We Lose:**
- Direct control over browser behavior
- Ability to customize scraping logic deeply
- Full access to browser APIs

**What We Gain:**
- Deployment simplicity
- Scalability
- Reliability
- Faster development
- Lower costs

**Verdict:** The trade-off is absolutely worth it. We get 90% of functionality with 10% of complexity.

---

## 📊 Instagram Scraper Details

### Capabilities

**Hashtag Scraping:**
- Scrapes posts by hashtag
- Extracts: caption, likes, comments, timestamp, author
- Normalizes data to database schema

**Profile Scraping:**
- Scrapes posts from a profile
- Extracts: all post details, hashtags, mentions
- Handles images, videos, carousels

### Data Flow

```
Instagram Scraper
  ↓
Apify Actor (apify/instagram-scraper)
  ↓
Raw Dataset (posts, metadata)
  ↓
Normalization (clean, extract, structure)
  ↓
Database (social_listening.mentions)
```

### Example Normalized Data

```json
{
  "platform": "instagram",
  "platform_id": "3123456789",
  "caption": "Check out our new product! #mybrand",
  "author_username": "user123",
  "likes": 450,
  "comments": 23,
  "views": 0,
  "post_url": "https://instagram.com/p/ABC123/",
  "instagram_data": {
    "short_code": "ABC123",
    "post_type": "image",
    "display_url": "https://...",
    "hashtags": ["#mybrand"],
    "mentions": ["@partner"],
    "is_sponsored": false
  },
  "is_relevant": null,      // Phase 3.1
  "sentiment_score": null,   // Phase 3.2
  "sentiment_label": null    // Phase 3.2
}
```

---

## 🎵 TikTok Scraper Details

### Capabilities

**Hashtag Scraping:**
- Scrapes videos by hashtag
- Extracts: caption, likes, comments, shares, views, author
- TikTok-specific: music, duets, stitches
- Engagement rate calculation

**Profile Scraping:**
- Scrapes videos from a profile
- Extracts: all video details, author stats
- Handles verified accounts

**Search Query Scraping:**
- Scrapes videos from search results
- Keyword-based discovery
- Trend identification

### Data Flow

```
TikTok Scraper
  ↓
Apify Actor (apify/tiktok-scraper)
  ↓
Raw Dataset (videos, metadata)
  ↓
Normalization (clean, extract, structure)
  ↓
Database (social_listening.mentions)
```

### Example Normalized Data

```json
{
  "platform": "tiktok",
  "platform_id": "7123456789012345678",
  "caption": "Check out this dance! #viral #foryou",
  "author_username": "user123",
  "likes": 12500,
  "comments": 450,
  "shares": 230,
  "views": 150000,
  "post_url": "https://tiktok.com/@user123/video/7123456789012345678",
  "tiktok_data": {
    "video_id": "7123456789012345678",
    "author": {
      "id": "123456789",
      "username": "user123",
      "nickname": "User 123",
      "verified": false,
      "followers": 45000,
      "following": 320,
      "hearts": 1200000,
      "videos": 234,
      "signature": "Just vibing 🎵"
    },
    "video": {
      "url": "https://...",
      "cover_url": "https://...",
      "duration": 15
    },
    "music": {
      "id": "7000000000000000000",
      "title": "Original Sound",
      "author": "user123",
      "original": true
    },
    "hashtags": ["#viral", "#foryou"],
    "mentions": ["@partner"],
    "is_ad": false,
    "is_duet": false,
    "is_stitch": false,
    "source_type": "hashtag",
    "source_value": "viral"
  },
  "is_relevant": null,      // Populated by existing AI system
  "sentiment_score": null,   // Populated by existing AI system
  "sentiment_label": null    // Populated by existing AI system
}
```

---

## 🔜 Next Steps

### Phase 3: AI Processing ✅ (Built by Other Developer)
- ✅ **Relevance Filter** - AI filtering of mentions
- ✅ **Sentiment Analysis** - Multi-model sentiment analysis
- **Note**: These systems read from `social_listening.mentions` table and populate:
  - `is_relevant`, `relevance_confidence`
  - `sentiment_score`, `sentiment_label`, `emotions`

### Phase 4: Analytics (Pending)
- Trend detection (TF-IDF + time decay)
- Influencer scoring (reach × relevance × engagement × trust)
- Daily stats aggregation
- Write to `trends`, `influencers`, `daily_stats` tables

### Phase 5: Frontend (Pending)
- Campaign dashboard
- Real-time job progress tracking
- Mention feed with filters
- Trend visualization
- Influencer leaderboard
- Alert management UI

### Phase 6: Testing & Optimization (Pending)
- End-to-end testing
- Performance optimization
- Error handling improvements
- Documentation updates

---

## 🎓 Learning from Reference Code

The Instagram scraper was ported from:
- `/social_scrapers/instagram/instagram_scraper.py`
- `/social_scrapers/instagram/instagram_standalone.py`

**Key Patterns Preserved:**
- Apify SDK usage
- Data normalization
- Hashtag/mention extraction
- Safe type conversion
- Error handling

**JavaScript Adaptations:**
- ES6 modules instead of Python imports
- Promise-based async instead of Python async/await syntax
- Native array methods instead of pandas
- JSON handling instead of Python dicts

---

## 📝 API Endpoints Summary

### Campaign Management
- `create-campaign` - Create monitoring campaign
- `update-campaign` - Update campaign config
- `get-campaign` - Get campaign details
- `list-campaigns` - List user's campaigns
- `delete-campaign` - Delete campaign

### Job Management (Manual Trigger)
- `start-scrape` - Create scraping job (queues it)
- `process-jobs` - Trigger processing of queued jobs ⭐
- `get-job-status` - Get job progress
- `list-jobs` - List all jobs
- `cancel-job` - Cancel queued job

### Data Retrieval
- `get-mentions` - Get scraped mentions
- `get-mention-details` - Get mention + comments
- `get-trends` - Get trending topics
- `get-influencers` - Get influencer list
- `get-alerts` - Get active alerts
- `get-daily-stats` - Get daily statistics

### Alert Management
- `mark-alert-read` - Mark alert as read
- `dismiss-alert` - Dismiss alert

---

## 🔐 Security Notes

- **RLS Policies**: All tables have row-level security
- **Service Role Key**: Required for admin operations
- **User ID Validation**: All requests validate user ownership
- **API Token Security**: Never expose Apify token to frontend

---

## 🐛 Troubleshooting

### "Missing APIFY_API_TOKEN"
**Solution**: Add to `.env`:
```
APIFY_API_TOKEN=your-token-here
```

### "Job stuck in 'queued' status"
**Solution**: Call `process-jobs` endpoint to trigger processing

### "No data returned from Instagram"
**Possible causes**:
- Invalid hashtag/profile URL
- Apify rate limits
- Instagram blocking
- Network issues

**Check**: Apify dashboard for run details

---

## 📚 References

- [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- Social Scrapers Reference: `/social_scrapers/instagram/`

---

**Status**: Phase 2 Complete ✅ (Instagram + TikTok Scrapers)
**Phase 3**: ✅ Already built by other developer (AI filtering & sentiment)
**Next**: Phase 4 - Trend Detection & Influencer Scoring, OR Phase 5 - Frontend
**Updated**: 2025-10-25
