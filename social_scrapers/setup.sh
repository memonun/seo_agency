#!/bin/bash

# Social Scrapers Environment Setup Script
# Run this to set up everything you need

set -e  # Exit on error

echo "=========================================="
echo "Social Scrapers - Environment Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
echo "1. Checking Python version..."
PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
echo "   Python version: $PYTHON_VERSION"
if [[ "$PYTHON_VERSION" < "3.8" ]]; then
    echo -e "${RED}   ❌ Python 3.8+ required${NC}"
    exit 1
else
    echo -e "${GREEN}   ✅ Python version OK${NC}"
fi
echo ""

# Install Python packages
echo "2. Installing Python packages..."
pip install -q playwright==1.41.0 apify-client python-dotenv pandas requests tenacity
echo -e "${GREEN}   ✅ Python packages installed${NC}"
echo ""

# Install Playwright browsers
echo "3. Installing Playwright browser (Chromium)..."
echo "   This may take a few minutes..."
python -m playwright install chromium
echo -e "${GREEN}   ✅ Playwright Chromium installed${NC}"
echo ""

# Check .env file
echo "4. Checking environment variables..."
if [ ! -f ".env" ]; then
    echo -e "${RED}   ❌ .env file not found${NC}"
    echo "   Please create .env file with required variables"
    exit 1
fi

# Verify required env variables
python -c "
from dotenv import load_dotenv
import os
import sys

load_dotenv()
required = {
    'APIFY_API_TOKEN': 'Instagram scraping',
    'TIKTOK_COOKIE': 'TikTok scraping',
    'TIKTOK_USER_AGENT': 'TikTok scraping'
}

missing = []
for var, purpose in required.items():
    if not os.getenv(var):
        missing.append(f'{var} ({purpose})')
        print(f'❌ {var}')
    else:
        print(f'✅ {var}')

if missing:
    print(f'\n❌ Missing variables: {len(missing)}')
    for m in missing:
        print(f'   - {m}')
    sys.exit(1)
" || exit 1

echo -e "${GREEN}   ✅ Environment variables OK${NC}"
echo ""

# Test imports
echo "5. Testing Python imports..."
python -c "
import sys
try:
    from playwright.async_api import async_playwright
    print('✅ Playwright async')
except Exception as e:
    print(f'❌ Playwright async: {e}')
    sys.exit(1)

try:
    from apify_client import ApifyClient
    print('✅ Apify client')
except Exception as e:
    print(f'❌ Apify client: {e}')
    sys.exit(1)

try:
    import pandas as pd
    print('✅ Pandas')
except Exception as e:
    print(f'❌ Pandas: {e}')
    sys.exit(1)

try:
    from dotenv import load_dotenv
    print('✅ Python-dotenv')
except Exception as e:
    print(f'❌ Python-dotenv: {e}')
    sys.exit(1)
" || exit 1
echo ""

# Create output directories
echo "6. Creating output directories..."
mkdir -p outputs/instagram
mkdir -p outputs/tiktok
echo -e "${GREEN}   ✅ Output directories created${NC}"
echo ""

echo "=========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "You can now run the scrapers:"
echo ""
echo "  Instagram (profile scraping - WORKS):"
echo "    python instagram/instagram_standalone.py --input 'https://www.instagram.com/nasa/' --test"
echo ""
echo "  TikTok (query scraping - CURRENTLY HAS ISSUES):"
echo "    python tiktok/tiktok_standalone.py --input 'cat' --max-videos 20"
echo ""
echo "Note: See SETUP_GUIDE.md for known issues and troubleshooting"
echo ""
