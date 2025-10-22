#!/bin/bash
# Example: Filter TikTok posts for MIRX campaign

cd "$(dirname "$0")"

echo "🎯 Filtering TikTok posts for MIRX campaign..."
echo ""

python3 relevance_filter.py \
  --input ../outputs/tiktok/tiktok_query_cat_20251022_014000.json \
  --context "MIRX take off campaign - a blockchain project launching its testnet. We are looking for content related to:
- Cryptocurrency and crypto projects
- NFT collections and NFT trading
- Blockchain technology and Web3
- Crypto airdrops and token launches
- DeFi (Decentralized Finance)
- Smart contracts and dApps
- Crypto community and influencers
- Testnet launches and blockchain development

IRRELEVANT content includes general entertainment, unrelated topics, or content that only coincidentally mentions similar words without actual crypto/blockchain context." \
  --threshold 0.65 \
  --batch-size 10

echo ""
echo "✅ Filtering complete! Check the output file in ../outputs/filtered/"
