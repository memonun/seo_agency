# Relevance Filter Architecture

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RELEVANCE FILTER SYSTEM                       │
└─────────────────────────────────────────────────────────────────┘

INPUT LAYER
├── Scraper Output JSON (TikTok/Instagram/etc.)
│   └── Contains: videos/posts array with content data
└── Campaign Context (Text description)
    └── What content is relevant to your campaign?

                            ↓

PROCESSING LAYER
├── 1. Load & Parse JSON
│   ├── Detect platform (TikTok, Instagram, etc.)
│   ├── Extract posts array
│   └── Count total posts
│
├── 2. Content Extraction
│   ├── TikTok: desc, author, music, hashtags
│   ├── Instagram: caption, owner, hashtags, mentions
│   └── Generic: Flexible field extraction
│
├── 3. Batch Processing
│   ├── Split posts into batches (10-20 posts)
│   ├── For each batch:
│   │   ├── Format classification prompt
│   │   ├── Send to OpenAI API (GPT-4-mini)
│   │   ├── Parse JSON response
│   │   └── Extract classifications
│   └── Aggregate all results
│
└── 4. Classification & Filtering
    ├── For each post + classification:
    │   ├── Relevant + High Confidence (≥threshold) → relevant_posts
    │   ├── Relevant + Low Confidence (<threshold) → borderline_posts
    │   └── Irrelevant → irrelevant_posts
    └── Calculate statistics

                            ↓

OUTPUT LAYER
└── Filtered JSON Output
    ├── Input metadata
    ├── Filter configuration
    ├── Statistics (counts, rates, duration)
    ├── relevant_posts[]       ← Use these!
    ├── borderline_posts[]     ← Review manually
    └── irrelevant_posts[]     ← Archive/ignore
```

## LLM Classification Process

```
┌──────────────────────────────────────────────────────────────┐
│             LLM CLASSIFICATION (Per Batch)                    │
└──────────────────────────────────────────────────────────────┘

INPUT TO LLM:
┌─────────────────────────────────────────────────────────────┐
│ CAMPAIGN CONTEXT:                                           │
│ "MIRX blockchain testnet launch. Looking for crypto,       │
│  NFT, blockchain, Web3, airdrop content..."                 │
│                                                             │
│ POSTS TO CLASSIFY:                                          │
│ POST_0 (ID: 7561762873593056525):                          │
│ Description: The identity crisis of cats #funny #cat...    │
│ Author: Cats lover 001                                      │
│                                                             │
│ POST_1 (ID: 7562260601741806878):                          │
│ Description: Angry Cats. #cat #cats #catsoftiktok...       │
│ Author: lovepets_001                                        │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘

                            ↓
                    GPT-4-mini API
                            ↓

OUTPUT FROM LLM:
┌─────────────────────────────────────────────────────────────┐
│ [                                                           │
│   {                                                         │
│     "post_index": 0,                                        │
│     "relevant": false,                                      │
│     "confidence": 0.98,                                     │
│     "reasoning": "Content about cats, unrelated to crypto"  │
│   },                                                        │
│   {                                                         │
│     "post_index": 1,                                        │
│     "relevant": false,                                      │
│     "confidence": 0.95,                                     │
│     "reasoning": "Pet content, no blockchain context"       │
│   }                                                         │
│ ]                                                           │
└─────────────────────────────────────────────────────────────┘
```

## Decision Tree

```
For each post classification:

                    ┌─────────────┐
                    │  Is Relevant │
                    │  from LLM?   │
                    └──────┬───────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
         ✅ YES                         ❌ NO
            │                             │
    ┌───────▼────────┐                   │
    │  Confidence    │                   │
    │   ≥ Threshold? │                   │
    └────┬────────┬──┘                   │
         │        │                      │
      ✅ YES    ❌ NO                     │
         │        │                      │
         │        │                      │
    ┌────▼─────┐  ┌──▼───────┐     ┌────▼────────┐
    │ RELEVANT │  │BORDERLINE│     │ IRRELEVANT  │
    │  POSTS   │  │  POSTS   │     │   POSTS     │
    └──────────┘  └──────────┘     └─────────────┘
         │              │                  │
         ↓              ↓                  ↓
    Use these!    Review these      Archive/Ignore
```

## Efficiency Features

### 1. Batch Processing
- **Problem**: Making 100 API calls for 100 posts = slow & expensive
- **Solution**: Process 15 posts per call = only ~7 API calls
- **Savings**: 93% fewer API calls, 10x faster

### 2. Smart Threshold
- **Problem**: Some classifications are uncertain
- **Solution**: Separate high-confidence from borderline cases
- **Benefit**: Focus manual review only on uncertain posts

### 3. Platform Agnostic
- **Problem**: Each platform has different data structure
- **Solution**: Unified content extraction layer
- **Benefit**: One filter works for all platforms

### 4. Cost Optimization
- **Model**: GPT-4-mini (cheap, fast, accurate enough)
- **Prompt**: Concise, structured for JSON output
- **Temperature**: 0.3 (consistent, deterministic)
- **Result**: ~$0.01-0.05 per 100 posts

## Performance Metrics

| Posts | Batches | API Calls | Time | Cost (est.) |
|-------|---------|-----------|------|-------------|
| 20    | 2       | 2         | ~5s  | $0.002      |
| 100   | 7       | 7         | ~15s | $0.02       |
| 500   | 34      | 34        | ~60s | $0.10       |
| 1000  | 67      | 67        | ~2m  | $0.20       |

*Using batch_size=15, GPT-4-mini, includes API response time*

## Integration Points

### Current Workflow
```
Scraper → Raw JSON → Manual Review → Campaign Use
```

### New Workflow
```
Scraper → Raw JSON → Relevance Filter → Filtered JSON → Campaign Use
                                              ↓
                                       Borderline → Manual Review
```

### Future Extensions
- **Sentiment Analysis**: Add sentiment scoring to relevant posts
- **Priority Ranking**: Rank posts by engagement + relevance
- **Auto-tagging**: Add campaign-specific tags
- **Multi-campaign**: Filter for multiple campaigns at once
- **Real-time**: API endpoint for real-time filtering
