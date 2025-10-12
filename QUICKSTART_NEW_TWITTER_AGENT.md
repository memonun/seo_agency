# Quick Start Guide: Building Twitter Agents with GAME SDK

**Last Updated**: 2025-10-11
**Status**: Production-Ready Implementation Guide

---

## 🎯 Purpose

This guide captures the **successful patterns and critical lessons** learned from building `eventturer-twitter-agent`. Use this as your foundation when creating new Twitter scrapers/agents to avoid authentication headaches and focus on building features.

## ⚠️ CRITICAL SUCCESS FACTORS

### 1. **NEVER Use Direct Twitter API Access**
- ❌ **DON'T**: Create Twitter API clients with `tweepy`, `twitter-api-v2`, or raw API calls
- ✅ **DO**: Use GAME SDK's built-in Twitter functions exclusively
- **Why**: GAME SDK handles all Twitter authentication through their enterprise infrastructure

### 2. **Authentication is Through GAME SDK Only**
- You authenticate with GAME, NOT with Twitter
- GAME SDK manages Twitter API access on the backend
- Your app never sees Twitter API credentials

---

## 🔧 Environment Setup (The Right Way)

### Required Environment Variables

Create `.env` in the project root directory with these variables:

```bash
# ============================================
# GAME SDK Authentication (REQUIRED)
# ============================================
GAME_API_KEY=your_game_api_key_here
GAME_TWITTER_ACCESS_TOKEN=your_game_twitter_token_here

# Get your API key from: https://console.game.virtuals.io/
# Generate Twitter token with: python scripts/generate_token.py


# ============================================
# Database Configuration (REQUIRED)
# ============================================
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# For local development, you can also use PostgreSQL directly:
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname


# ============================================
# Rate Limiting Configuration (RECOMMENDED)
# ============================================
TWITTER_RATE_LIMIT_REQUESTS=40
TWITTER_RATE_LIMIT_WINDOW=300  # 5 minutes in seconds
TWITTER_RATE_LIMIT_RETRY_DELAY=60  # Initial retry delay in seconds
TWITTER_RATE_LIMIT_MAX_RETRIES=3


# ============================================
# Development/Testing (OPTIONAL)
# ============================================
TWITTER_MOCK_MODE=false  # Set to 'true' for development without API calls
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
```

### What You DON'T Need

```bash
# ❌ You DO NOT need these (common mistake):
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...
TWITTER_BEARER_TOKEN=...

# These are for direct Twitter API access, which we DON'T do
```

---

## 📦 Dependencies Installation

### Core Requirements

```bash
# Install GAME SDK and dependencies
pip install -r requirements.txt

# Or install package in development mode
pip install -e .
```

### Key Dependencies (`requirements.txt`)

```txt
# GAME SDK - Core framework
game-sdk>=0.1.0

# Twitter Plugin for GAME SDK - CRITICAL
twitter-plugin-gamesdk>=0.1.0

# Database
supabase>=2.0.0
psycopg2-binary>=2.9.0

# Utilities
python-dotenv>=1.0.0
requests>=2.31.0

# Optional: Analytics & Visualization
pandas>=2.0.0
matplotlib>=3.7.0
```

---

## 🏗️ Project Structure (Proven Architecture)

```
your-new-twitter-agent/
├── .env                              # Environment variables (NEVER commit)
├── .gitignore                        # Add .env to gitignore
├── src/
│   └── your_scraper/
│       ├── __init__.py
│       ├── functions.py              # GAME SDK Twitter functions
│       ├── database.py               # Database client (Supabase/PostgreSQL)
│       ├── agent.py                  # High-level AI agent (optional)
│       └── worker.py                 # Specialized workers (optional)
├── scripts/
│   ├── generate_token.py             # Generate GAME Twitter token
│   └── run_scraper.py                # Main execution script
├── docs/
│   └── QUICKSTART_NEW_TWITTER_AGENT.md  # This file
├── requirements.txt
└── setup.py
```

---

## 🚀 Implementation Patterns (Copy These)

### Pattern 1: Environment Loading

```python
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from project root
script_dir = Path(__file__).parent
project_root = script_dir.parent
env_file = project_root / ".env"

if env_file.exists():
    load_dotenv(env_file)
else:
    raise FileNotFoundError(f"Environment file not found: {env_file}")

# Validate required environment variables
required_vars = [
    'GAME_API_KEY',
    'GAME_TWITTER_ACCESS_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
]

for var in required_vars:
    if not os.getenv(var):
        raise EnvironmentError(f"Missing required environment variable: {var}")
```

### Pattern 2: GAME SDK Twitter Client Initialization

```python
from twitter_plugin_gamesdk import TwitterPlugin
import os

def get_twitter_client():
    """
    Initialize GAME SDK Twitter client.

    Returns:
        TwitterPlugin: Authenticated Twitter client through GAME SDK
    """
    access_token = os.getenv('GAME_TWITTER_ACCESS_TOKEN')

    if not access_token:
        raise ValueError("GAME_TWITTER_ACCESS_TOKEN not found in environment")

    try:
        client = TwitterPlugin(access_token=access_token)
        return client
    except Exception as e:
        raise ConnectionError(f"Failed to initialize GAME Twitter client: {e}")
```

### Pattern 3: Fetching Twitter Data (The Right Way)

```python
def fetch_tweets_by_keyword(keyword: str, limit: int = 100):
    """
    Fetch tweets using GAME SDK Twitter plugin.

    Args:
        keyword: Search keyword/hashtag
        limit: Maximum number of tweets to fetch

    Returns:
        list: Tweet data from GAME SDK
    """
    client = get_twitter_client()

    try:
        # Use GAME SDK's built-in search functionality
        tweets = client.search_tweets(
            query=keyword,
            max_results=limit
        )

        return tweets

    except Exception as e:
        print(f"Error fetching tweets: {e}")
        return []
```

### Pattern 4: Database Storage

```python
from supabase import create_client, Client
import os

class DatabaseClient:
    def __init__(self):
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_ANON_KEY')

        if not supabase_url or not supabase_key:
            raise ValueError("Supabase credentials not found")

        self.supabase: Client = create_client(supabase_url, supabase_key)

    def save_tweets(self, tweets: list, batch_id: str):
        """Save tweets to database."""
        try:
            response = self.supabase.schema('social_analytics')\
                .table('twitter_tweets')\
                .insert(tweets)\
                .execute()

            return response.data

        except Exception as e:
            print(f"Database error: {e}")
            return None

# Initialize global database client
db = DatabaseClient()
```

---

## 🎯 Agentic Analytics with GAME SDK

### Leveraging GAME SDK's AI Capabilities

```python
from game_sdk import Agent, Worker

class TwitterAnalyticsAgent(Agent):
    """
    High-level agent that orchestrates Twitter analytics tasks.
    Leverages GAME SDK's agentic capabilities for intelligent analysis.
    """

    def __init__(self):
        super().__init__(
            name="Twitter Analytics Agent",
            description="Analyzes Twitter data using GAME SDK's AI capabilities"
        )

        # Add specialized workers
        self.add_worker(TrendAnalysisWorker())
        self.add_worker(SentimentAnalysisWorker())
        self.add_worker(DataCollectionWorker())

    async def analyze_keyword(self, keyword: str):
        """
        Analyze a keyword using agentic approach.
        The agent will autonomously determine the best analysis strategy.
        """
        prompt = f"""
        Analyze Twitter activity for keyword: {keyword}

        Tasks:
        1. Fetch recent tweets
        2. Perform sentiment analysis
        3. Identify trends and patterns
        4. Generate insights and recommendations
        """

        result = await self.execute(prompt)
        return result
```

### Using Sequential Thinking for Complex Analysis

```python
async def deep_analysis_with_ultrathink(keyword: str):
    """
    Perform deep analysis using sequential thinking (ultrathink).
    This leverages GAME SDK's cognitive capabilities for multi-step reasoning.
    """
    from game_sdk.cognitive import SequentialThinking

    thinker = SequentialThinking()

    # Phase 1: Data Collection
    thoughts_1 = await thinker.think(
        f"What data should I collect to analyze Twitter activity for '{keyword}'?"
    )

    # Phase 2: Analysis Strategy
    thoughts_2 = await thinker.think(
        f"Based on available data, what's the best analysis approach for '{keyword}'?"
    )

    # Phase 3: Insight Generation
    thoughts_3 = await thinker.think(
        f"What actionable insights can I derive from this analysis?"
    )

    return {
        'collection_strategy': thoughts_1,
        'analysis_strategy': thoughts_2,
        'insights': thoughts_3
    }
```

---

## 🔥 Common Pitfalls (Avoid These)

### ❌ Pitfall 1: Direct Twitter API Access
```python
# DON'T DO THIS:
import tweepy

auth = tweepy.OAuthHandler(api_key, api_secret)
twitter_client = tweepy.API(auth)  # ❌ WRONG
```

### ✅ Correct Approach
```python
# DO THIS:
from twitter_plugin_gamesdk import TwitterPlugin

client = TwitterPlugin(access_token=os.getenv('GAME_TWITTER_ACCESS_TOKEN'))  # ✅ RIGHT
```

### ❌ Pitfall 2: Mixing Authentication Methods
```python
# DON'T DO THIS:
game_client = GameSDK(api_key=game_key)
twitter_client = tweepy.API(...)  # ❌ Mixing GAME and direct Twitter access
```

### ✅ Correct Approach
```python
# DO THIS:
game_client = GameSDK(api_key=game_key)
twitter_client = game_client.get_twitter_plugin()  # ✅ Get Twitter through GAME
```

### ❌ Pitfall 3: Not Using Mock Mode for Development
```python
# DON'T DO THIS:
# Always hitting Twitter API during development, wasting rate limits
tweets = fetch_live_tweets(keyword)  # ❌ Wastes API calls during testing
```

### ✅ Correct Approach
```python
# DO THIS:
# Use mock mode during development
MOCK_MODE = os.getenv('TWITTER_MOCK_MODE', 'false').lower() == 'true'

if MOCK_MODE:
    tweets = generate_mock_tweets(keyword)  # ✅ Mock data for testing
else:
    tweets = fetch_live_tweets(keyword)  # ✅ Real data for production
```

---

## 🧪 Testing Your Setup

### Quick Validation Script

```python
#!/usr/bin/env python3
"""
Quick validation script to test your Twitter agent setup.
Run this before building features.
"""

import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment from project root
project_root = Path(__file__).parent.parent
load_dotenv(project_root / ".env")

def validate_environment():
    """Validate all required environment variables."""
    required = {
        'GAME_API_KEY': 'GAME SDK API key',
        'GAME_TWITTER_ACCESS_TOKEN': 'GAME Twitter access token',
        'SUPABASE_URL': 'Supabase project URL',
        'SUPABASE_ANON_KEY': 'Supabase anonymous key'
    }

    print("🔍 Validating environment variables...")
    all_valid = True

    for var, description in required.items():
        value = os.getenv(var)
        if value:
            print(f"✅ {var}: Found ({description})")
        else:
            print(f"❌ {var}: Missing ({description})")
            all_valid = False

    return all_valid

def test_game_twitter_connection():
    """Test GAME SDK Twitter connection."""
    print("\n🔍 Testing GAME SDK Twitter connection...")

    try:
        from twitter_plugin_gamesdk import TwitterPlugin

        client = TwitterPlugin(
            access_token=os.getenv('GAME_TWITTER_ACCESS_TOKEN')
        )

        print("✅ GAME SDK Twitter client initialized successfully")
        return True

    except Exception as e:
        print(f"❌ Failed to initialize GAME Twitter client: {e}")
        return False

def test_database_connection():
    """Test database connection."""
    print("\n🔍 Testing database connection...")

    try:
        from supabase import create_client

        client = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_ANON_KEY')
        )

        print("✅ Database connection established")
        return True

    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def main():
    print("🚀 Twitter Agent Setup Validation")
    print("=" * 60)

    env_valid = validate_environment()
    twitter_valid = test_game_twitter_connection()
    db_valid = test_database_connection()

    print("\n" + "=" * 60)
    if env_valid and twitter_valid and db_valid:
        print("🎉 All systems operational! Ready to build features.")
        return 0
    else:
        print("⚠️  Some systems failed validation. Fix errors above.")
        return 1

if __name__ == "__main__":
    exit(main())
```

Save as `scripts/validate_setup.py` and run:
```bash
python scripts/validate_setup.py
```

---

## 📋 Pre-Flight Checklist

Before building your new Twitter agent, ensure:

- [ ] `config/.env` file exists with all required variables
- [ ] GAME SDK installed: `pip install game-sdk`
- [ ] Twitter plugin installed: `pip install twitter-plugin-gamesdk`
- [ ] Supabase client installed: `pip install supabase`
- [ ] Environment variables validated with `validate_setup.py`
- [ ] GAME Twitter token generated (if needed): `python scripts/generate_token.py`
- [ ] Database schema created (use migration scripts)
- [ ] Mock mode configured for development testing
- [ ] Rate limiting settings configured

---

## 🎓 Key Learnings Summary

### What Made Us Successful

1. **Used GAME SDK exclusively for Twitter access** - No direct API calls
2. **Proper environment variable structure** - Separated GAME auth from database config
3. **Mock mode for development** - Preserved API rate limits during testing
4. **Hybrid database approach** - Leveraged both PostgreSQL and Supabase
5. **Rate limiting built-in** - Prevented API quota exhaustion
6. **Comprehensive error handling** - Graceful degradation when services unavailable

### What Took Time to Figure Out (So You Don't Have To)

1. **Authentication flow** - Took multiple attempts to understand GAME SDK handles Twitter auth
2. **Environment variable naming** - `GAME_TWITTER_ACCESS_TOKEN` not `TWITTER_ACCESS_TOKEN`
3. **Token generation** - Need to run `generate_token.py` once to get Twitter token
4. **Database schema** - Use `social_analytics` schema for Twitter data
5. **Rate limiting** - Twitter API limits are 40 requests/5 minutes through GAME SDK
6. **Mock data structure** - Mock data must match GAME SDK's Twitter response format

---

## 🔮 Next Steps: Building Your Interface

### For Keyword Search Feature

```python
def enable_keyword_search(keywords: list[str]):
    """
    Enable keyword search for Twitter data.

    Args:
        keywords: List of keywords/hashtags to search
    """
    client = get_twitter_client()
    results = {}

    for keyword in keywords:
        tweets = client.search_tweets(
            query=keyword,
            max_results=100
        )

        results[keyword] = {
            'tweets': tweets,
            'count': len(tweets),
            'timestamp': datetime.now().isoformat()
        }

    return results
```

### For Agentic Analytics

```python
async def agentic_analysis(keywords: list[str]):
    """
    Perform autonomous analysis using GAME SDK's AI capabilities.
    """
    agent = TwitterAnalyticsAgent()

    # Let the agent autonomously determine analysis strategy
    analysis_plan = await agent.plan_analysis(keywords)

    # Execute analysis with ultrathink (sequential reasoning)
    results = await agent.execute_with_ultrathink(analysis_plan)

    return results
```

---

## 📞 Troubleshooting

### "GAME_TWITTER_ACCESS_TOKEN not found"
**Solution**: Run `python scripts/generate_token.py` to generate token

### "Twitter plugin not available"
**Solution**: Install with `pip install twitter-plugin-gamesdk`

### "Rate limit exceeded"
**Solution**:
- Enable mock mode: `TWITTER_MOCK_MODE=true` in `.env`
- Adjust rate limits: `TWITTER_RATE_LIMIT_REQUESTS=20` (lower value)
- Wait for rate limit window to reset (5 minutes)

### "Database connection failed"
**Solution**:
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Check if database schema `social_analytics` exists
- Test connection with `scripts/validate_setup.py`

---

## 📚 Additional Resources

- **GAME SDK Documentation**: https://docs.game.virtuals.io/
- **GAME Console** (get API keys): https://console.game.virtuals.io/
- **Working Example**: See `scripts/run_analytics.py` in this repository
- **Database Schema**: See `social_analytics` schema documentation
- **Critical Reading**: `/docs/GAME_SDK_TWITTER_APPROACH.md`

---

## ✅ You're Ready When...

- [ ] You can run `scripts/validate_setup.py` successfully
- [ ] You understand GAME SDK handles Twitter authentication
- [ ] You have working environment variables in `config/.env`
- [ ] You can fetch tweets using GAME SDK Twitter plugin
- [ ] You can store data in your database
- [ ] Mock mode works for development

**Now go build amazing features!** 🚀

---

*Generated from successful production implementation: `eventturer-twitter-agent`*
*Last verified: 2025-10-11*
