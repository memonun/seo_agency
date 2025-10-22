#!/bin/bash

OUTPUT_DIR="outputs/mirx_campaign"

echo "📊 MIRX Campaign Scraping Progress Monitor"
echo "=========================================="
echo ""

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "❌ Output directory not found: $OUTPUT_DIR"
    exit 1
fi

echo "📁 Output Directory: $OUTPUT_DIR"
echo ""

# Count files
total_files=$(ls -1 "$OUTPUT_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
echo "📄 JSON Files Created: $total_files"
echo ""

if [ $total_files -gt 0 ]; then
    echo "📋 Files:"
    echo "---"
    ls -lht "$OUTPUT_DIR"/*.json | head -20 | awk '{printf "  %s %s - %s\n", $9, $5, $6" "$7" "$8}'
    echo ""
    
    echo "📊 Statistics:"
    echo "---"
    for file in "$OUTPUT_DIR"/*.json; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            videos=$(jq -r '.metadata.total_videos // 0' "$file" 2>/dev/null)
            comments=$(jq -r '.metadata.total_comments // 0' "$file" 2>/dev/null)
            duration=$(jq -r '.metadata.scrape_duration_seconds // 0' "$file" 2>/dev/null)
            query=$(jq -r '.input.value' "$file" 2>/dev/null)
            
            printf "  %-40s Videos: %-4s Comments: %-5s Duration: %.1fs\n" "$query" "$videos" "$comments" "$duration"
        fi
    done
    
    echo ""
    echo "💾 Total Size: $(du -sh "$OUTPUT_DIR" | cut -f1)"
else
    echo "⏳ No files created yet. Scraping in progress..."
fi

echo ""
echo "=========================================="
echo "💡 Tip: Run this script again to see updated progress"
