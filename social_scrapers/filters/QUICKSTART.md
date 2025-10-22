# Quick Start Guide - Relevance Filter

Get up and running in 3 minutes!

## Step 1: Setup (One-time)

Add your OpenAI API key to `.env` file:

```bash
# Edit social_scrapers/.env and replace:
OPENAI_API_KEY=your_openai_api_key_here

# With your actual key:
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
```

Get your key from: https://platform.openai.com/api-keys

## Step 2: Run Your First Filter

```bash
cd social_scrapers/filters

# Filter TikTok posts for MIRX campaign
python3 relevance_filter.py \
  --input ../outputs/tiktok/tiktok_query_cat_20251022_014000.json \
  --context "MIRX blockchain testnet launch. Looking for cryptocurrency, NFT, blockchain, Web3, and airdrop content."
```

## Step 3: Check Results

Output will be saved to: `social_scrapers/outputs/filtered/`

Look for:
- `relevant_posts[]` - Posts that match your campaign
- `borderline_posts[]` - Posts to review manually
- `statistics` - Summary of filtering results

## Example Output

```json
{
  "statistics": {
    "total_posts": 20,
    "relevant_posts": 3,
    "irrelevant_posts": 15,
    "borderline_posts": 2,
    "relevance_rate": 15.0
  }
}
```

## Adjust Filtering

### More strict (fewer results)
```bash
python3 relevance_filter.py \
  --input your_file.json \
  --context "Your campaign" \
  --threshold 0.8
```

### More lenient (more results)
```bash
python3 relevance_filter.py \
  --input your_file.json \
  --context "Your campaign" \
  --threshold 0.5
```

## Tips for Better Results

### ✅ Good Campaign Context
```
"MIRX blockchain testnet launch. We're looking for:
- Cryptocurrency and crypto projects
- NFT collections and trading
- Blockchain technology discussions
- Web3 applications
- Crypto airdrops and token launches

NOT looking for: general tech, unrelated entertainment"
```

### ❌ Bad Campaign Context
```
"MIRX campaign"  (too vague)
"Blockchain"     (no specifics)
```

## Common Use Cases

### Filter Instagram Posts
```bash
python3 relevance_filter.py \
  --input ../outputs/instagram/instagram_profile_artibir_*.json \
  --context "Event ticket platform. Looking for content about concerts, events, nightlife, entertainment."
```

### Filter Multiple Files
```bash
# Create a script
for file in ../outputs/tiktok/tiktok_query_*; do
  python3 relevance_filter.py \
    --input "$file" \
    --context "Your campaign context"
done
```

### High-Precision Mode
```bash
python3 relevance_filter.py \
  --input your_file.json \
  --context "Your campaign" \
  --threshold 0.85 \
  --batch-size 10
```

## Troubleshooting

### Error: OPENAI_API_KEY not found
- Check that you've added your API key to `.env`
- Make sure there are no quotes around the key value
- The key should start with `sk-`

### No relevant posts found
- Lower the threshold: `--threshold 0.5`
- Make your campaign context more specific
- Check if your search query actually matches your campaign

### Rate limit errors
- Reduce batch size: `--batch-size 10`
- Add delays between requests (automatic)
- Check your OpenAI usage limits

## Cost Estimates

| Posts | Estimated Cost |
|-------|----------------|
| 20    | $0.002         |
| 100   | $0.02          |
| 500   | $0.10          |
| 1000  | $0.20          |

Using GPT-4-mini (cheapest, still accurate)

## Next Steps

1. Run the filter on your MIRX campaign TikTok outputs
2. Review the `relevant_posts` in the output JSON
3. Check `borderline_posts` for manual review
4. Adjust threshold if needed
5. Integrate filtered results into your workflow

## Need Help?

Check the full documentation:
- `README.md` - Complete usage guide
- `ARCHITECTURE.md` - System design and flow
- `example_mirx_filter.sh` - Ready-to-run example
