#!/bin/bash

# MIRX TikTok Query Scraper
# This script scrapes all MIRX-related queries with full comment data

QUERIES=(
    "\$MIRX"
    "#Miraclechain"
    "#Airdrop"
    "#Testnet"
    "#NextGenerationChain"
    "#NFT"
    "#Blockchain"
    "#BlockchainRevolution"
    "#MIRXTakeoff"
    "#UtilityFirst"
    "#PassiveIncome"
)

MAX_VIDEOS=200
MAX_COMMENT_PAGES=10
OUTPUT_DIR="outputs/mirx_campaign"

echo "🚀 Starting MIRX Campaign TikTok Scraping"
echo "==========================================="
echo "Total queries: ${#QUERIES[@]}"
echo "Max videos per query: $MAX_VIDEOS"
echo "Max comment pages per video: $MAX_COMMENT_PAGES"
echo "Output directory: $OUTPUT_DIR"
echo ""

mkdir -p "$OUTPUT_DIR"

for i in "${!QUERIES[@]}"; do
    query="${QUERIES[$i]}"
    num=$((i + 1))
    
    echo ""
    echo "[$num/${#QUERIES[@]}] Processing query: $query"
    echo "-------------------------------------------"
    
    python tiktok_standalone.py \
        --input "$query" \
        --max-videos $MAX_VIDEOS \
        --max-pages $MAX_COMMENT_PAGES \
        --output "$OUTPUT_DIR"
    
    if [ $? -eq 0 ]; then
        echo "✅ Query completed successfully"
    else
        echo "❌ Query failed"
    fi
    
    # Rate limiting between queries
    if [ $num -lt ${#QUERIES[@]} ]; then
        echo "⏳ Waiting 5 seconds before next query..."
        sleep 5
    fi
done

echo ""
echo "==========================================="
echo "✅ All queries completed!"
echo "📊 Results saved to: $OUTPUT_DIR"
echo ""
echo "Summary of files:"
ls -lh "$OUTPUT_DIR" | tail -n +2

