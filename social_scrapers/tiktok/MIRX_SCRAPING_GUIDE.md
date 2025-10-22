# MIRX Campaign TikTok Scraping Guide

## 🎯 Campaign Overview

This scraping campaign extracts **ALL videos and comments** for MIRX-related queries from TikTok.

### Queries Being Scraped (11 total)

1. `$MIRX`
2. `#Miraclechain`
3. `#Airdrop`
4. `#Testnet`
5. `#NextGenerationChain`
6. `#NFT`
7. `#Blockchain`
8. `#BlockchainRevolution`
9. `#MIRXTakeoff`
10. `#UtilityFirst`
11. `#PassiveIncome`

## 📊 Scraping Configuration

- **Max Videos per Query**: 200
- **Max Comment Pages per Video**: 10 (up to ~200 comments per video)
- **Total Expected Output**: Up to 2,200 videos + all their comments
- **Output Directory**: `outputs/mirx_campaign/`

## 🚀 Running the Scraper

### Automatic Batch Scraping
```bash
cd /Users/kuzey/seo_agency/social_scrapers/tiktok
./scrape_mirx_queries.sh
```

### Monitor Progress
```bash
./monitor_progress.sh
```

### Manual Single Query
```bash
python tiktok_standalone.py \
  --input "#MIRXTakeoff" \
  --max-videos 200 \
  --max-pages 10 \
  --output outputs/mirx_campaign
```

## 📁 Output Structure

Each query generates a JSON file:
```
outputs/mirx_campaign/
├── tiktok_query_$MIRX_20251022_020413.json
├── tiktok_query_#Miraclechain_20251022_020530.json
├── tiktok_query_#Airdrop_20251022_020645.json
└── ... (11 files total)
```

### JSON File Structure
```json
{
  "input": {
    "type": "query",
    "value": "$MIRX",
    "scraped_at": "2025-10-22T02:04:13.272"
  },
  "metadata": {
    "max_videos": 200,
    "scrape_comments": true,
    "max_comment_pages": 10,
    "total_videos": 47,
    "total_comments": 1250,
    "scrape_duration_seconds": 125.5
  },
  "videos": [
    {
      "video_id": "7560350589687811348",
      "desc": "MIRX to the moon! #MIRX #crypto",
      "create_time": 1757850000,
      "search_query": "$MIRX",
      "author": {
        "id": "...",
        "unique_id": "crypto_trader_001",
        "nickname": "Crypto Trader",
        "verified": false,
        "follower_count": 15000,
        "following_count": 500,
        "heart_count": 50000,
        "video_count": 150
      },
      "stats": {
        "play_count": 25000,
        "digg_count": 1200,
        "comment_count": 75,
        "share_count": 150,
        "repost_count": 50,
        "engagement_rate": 5.68
      },
      "hashtags": ["MIRX", "crypto", "blockchain"],
      "mentions": ["@mirx_official"],
      "music": {...},
      "video": {...}
    }
  ],
  "comments": {
    "7560350589687811348": {
      "video_id": "7560350589687811348",
      "total_comments": 75,
      "comments": [
        {
          "comment_id": "123456789",
          "text": "When moon?",
          "user": {
            "uid": "...",
            "unique_id": "hodler123",
            "nickname": "HODL Master",
            "verified": false
          },
          "like_count": 25,
          "reply_count": 3,
          "create_time": 1757851000,
          "is_author_liked": false
        }
      ]
    }
  }
}
```

## 📈 Data Analysis Examples

### Python - Load and Analyze
```python
import json
import pandas as pd

# Load all MIRX campaign data
data_files = glob.glob('outputs/mirx_campaign/*.json')

all_videos = []
all_comments = []

for file in data_files:
    with open(file, 'r') as f:
        data = json.load(f)

        # Extract videos
        for video in data['videos']:
            video['query'] = data['input']['value']
            all_videos.append(video)

        # Extract comments
        for video_id, comment_data in data['comments'].items():
            for comment in comment_data['comments']:
                comment['video_id'] = video_id
                comment['query'] = data['input']['value']
                all_comments.append(comment)

# Create DataFrames
df_videos = pd.DataFrame(all_videos)
df_comments = pd.DataFrame(all_comments)

# Analysis examples
print(f"Total videos: {len(df_videos)}")
print(f"Total comments: {len(df_comments)}")
print(f"\nTop authors by followers:")
print(df_videos.nlargest(10, 'author.follower_count')[['author.unique_id', 'author.follower_count']])
print(f"\nEngagement by query:")
print(df_videos.groupby('query')['stats.engagement_rate'].mean())
```

### Key Metrics to Track

1. **Video Metrics**
   - Total videos per query
   - Average engagement rate
   - Top performing videos (by views, likes, comments)
   - Hashtag co-occurrence analysis
   - Author influence (follower counts)

2. **Comment Metrics**
   - Total comments per query
   - Sentiment analysis on comment text
   - Most active commenters
   - Comment velocity (comments over time)

3. **Cross-Query Analysis**
   - Which queries have most overlap?
   - Which authors post across multiple queries?
   - Hashtag combinations

## ⚙️ Troubleshooting

### Issue: Cookie Expired
If you see authentication errors:
```bash
# Update TikTok cookie in .env file
vi /Users/kuzey/seo_agency/social_scrapers/.env
# Update TIKTOK_COOKIE value
```

### Issue: Rate Limiting
If TikTok rate limits:
- Script includes 5-second delays between queries
- Comment scraping has 0.7-1.0s delays between pages
- If still limited, increase delays in script

### Issue: No Videos Found
Some queries might return 0 results:
- Query might have no content on TikTok
- Spelling/formatting might be incorrect
- Content might be region-restricted

## 📞 Support

For issues or questions:
1. Check logs in terminal output
2. Review JSON files for errors
3. Run `./monitor_progress.sh` to see current status

## 🔄 Re-running Scraping

To re-scrape (will overwrite existing data):
```bash
./scrape_mirx_queries.sh
```

To scrape additional queries:
```bash
# Edit scrape_mirx_queries.sh and add to QUERIES array
nano scrape_mirx_queries.sh
```

## 📊 Expected Timeline

- **Per Query**: ~2-5 minutes (depending on video count)
- **Total Campaign**: ~20-50 minutes for all 11 queries
- **Bottleneck**: Comment scraping (most time-consuming)

## 💾 Storage Requirements

- **Per Query**: ~500KB - 10MB (depending on video/comment count)
- **Total Campaign**: ~10-50MB estimated
