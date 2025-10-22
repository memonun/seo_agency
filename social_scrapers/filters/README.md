# Relevance Filter

AI-powered content relevance classifier for social media marketing campaigns.

## Overview

The Relevance Filter uses LLM (GPT-4-mini) to automatically classify social media posts as relevant or irrelevant based on your campaign context. It processes posts in batches for efficiency and cost-effectiveness.

## Features

- **Platform-agnostic**: Works with TikTok, Instagram, YouTube, and more
- **Batch processing**: Efficient API usage (15 posts per call by default)
- **Confidence scoring**: Each classification includes a confidence score (0-1)
- **Borderline detection**: Flags posts with low confidence for manual review
- **Detailed reasoning**: Provides explanation for each classification
- **Cost-efficient**: ~$0.01-0.05 per 100 posts using GPT-4-mini

## Setup

1. Add your OpenAI API key to `.env`:
```bash
OPENAI_API_KEY=your_key_here
```

2. Install dependencies (if not already installed):
```bash
pip install openai python-dotenv
```

## Usage

### Basic Usage

```bash
python relevance_filter.py \
  --input ../outputs/tiktok/tiktok_query_cat_20251022_014000.json \
  --context "MIRX take off campaign - a blockchain project launching its testnet. Looking for crypto, NFT, blockchain, Web3, and airdrop related content."
```

### Advanced Options

```bash
python relevance_filter.py \
  --input ../outputs/tiktok/tiktok_query_MIRX_20251021_142725.json \
  --context "Your campaign description here" \
  --model gpt-4o-mini \
  --batch-size 15 \
  --threshold 0.7 \
  --output /path/to/custom/output/
```

### Parameters

- `--input`: Path to scraper output JSON file (required)
- `--context`: Campaign context description (required)
- `--model`: OpenAI model (default: `gpt-4o-mini`)
- `--batch-size`: Posts per API call (default: 15)
- `--threshold`: Confidence threshold 0-1 (default: 0.6)
- `--output`: Custom output directory (default: `outputs/filtered/`)

## Output Structure

The filter creates a JSON file with:

```json
{
  "input": {
    "file": "path/to/input.json",
    "platform": "tiktok",
    "filtered_at": "2025-10-22T..."
  },
  "filter_config": {
    "campaign_context": "Your campaign description",
    "model": "gpt-4o-mini",
    "confidence_threshold": 0.6
  },
  "statistics": {
    "total_posts": 20,
    "relevant_posts": 5,
    "irrelevant_posts": 13,
    "borderline_posts": 2,
    "relevance_rate": 25.0
  },
  "relevant_posts": [
    {
      "video_id": "...",
      "desc": "...",
      "_classification": {
        "relevant": true,
        "confidence": 0.85,
        "reasoning": "Directly discusses blockchain technology"
      }
    }
  ],
  "borderline_posts": [...],
  "irrelevant_posts": [...]
}
```

## Examples

### Example 1: MIRX Blockchain Campaign

```bash
python relevance_filter.py \
  --input ../outputs/tiktok/tiktok_query_MIRX_20251021_142725.json \
  --context "MIRX take off campaign. We are promoting the MIRX blockchain project launching its testnet. Relevant content includes: cryptocurrency discussions, NFT content, blockchain technology, Web3 applications, crypto airdrops, DeFi, smart contracts, and crypto community engagement."
```

### Example 2: Instagram Profile Campaign

```bash
python relevance_filter.py \
  --input ../outputs/instagram/instagram_profile_artibir_20251020_140041.json \
  --context "Artibir ticket platform promotion. Looking for content about event tickets, concert experiences, entertainment, nightlife, and event planning."
```

### Example 3: High Precision Mode

For campaigns requiring high accuracy, increase the threshold:

```bash
python relevance_filter.py \
  --input ../outputs/tiktok/tiktok_query_NFT_20251021_142925.json \
  --context "NFT art collection launch focused on digital art and creative NFTs" \
  --threshold 0.8
```

## Cost Estimates

Using GPT-4-mini (as of Oct 2024):
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

Typical costs:
- **20 posts**: ~$0.002-0.005
- **100 posts**: ~$0.01-0.05
- **1000 posts**: ~$0.10-0.50

## Tips

1. **Write clear campaign context**: The more specific your context, the better the classification
2. **Review borderline posts**: Posts with confidence < threshold are flagged for manual review
3. **Adjust threshold**: Lower for broader results (0.5), higher for stricter filtering (0.8)
4. **Batch size**: Keep at 10-20 for optimal balance of speed and API limits

## Troubleshooting

### Error: OPENAI_API_KEY not found
Add your API key to `.env` file in the `social_scrapers/` directory.

### Rate limits
Reduce batch size or add delays between batches if hitting rate limits.

### Low relevance rate
- Make your campaign context more specific
- Lower the confidence threshold
- Check if posts actually match your campaign topic

## Integration

You can also use this programmatically:

```python
from relevance_filter import RelevanceFilter

filter_engine = RelevanceFilter(
    model='gpt-4o-mini',
    batch_size=15,
    confidence_threshold=0.6
)

result = filter_engine.filter_content(
    input_file='path/to/input.json',
    campaign_context='Your campaign description'
)

print(f"Found {result['statistics']['relevant_posts']} relevant posts")
```
