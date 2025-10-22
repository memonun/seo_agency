# Pure AI Twitter Sentiment Analysis

Simple, powerful Twitter sentiment analysis using OpenRouter AI. No keyword matching - pure intelligence!

## Quick Start

1. **Paste your Twitter data** in `input.json`
2. **Run analysis**: `npm test`
3. **Get insights** in the generated results file

## Input Format

```json
{
  "tweets": [
    {
      "id": "123",
      "text": "Your tweet text here",
      "author": "username", 
      "replies": [
        "Reply 1",
        "Reply 2"
      ]
    }
  ]
}
```

## Output Format

```json
{
  "tweet_id": "123",
  "tweet_text": "Your tweet text",
  "tweet_sentiment": {
    "label": "positive",
    "score": 0.8,
    "confidence": 0.9,
    "reasoning": "Enthusiastic tone with positive indicators"
  },
  "mentions_sentiment": {
    "score": -0.2,
    "distribution": {"positive": 3, "negative": 5, "neutral": 2},
    "summary": "Mixed reactions - pricing concerns dominate"
  },
  "overall_summary": {
    "contradiction_detected": true,
    "key_insight": "Positive tweet but negative replies",
    "recommendation": "Address pricing concerns in replies"
  }
}
```

## Key Features

✅ **Pure AI Analysis** - No basic keyword matching  
✅ **Tweet vs Replies** - Detects contradictions  
✅ **Context Aware** - Understands sarcasm, emojis, culture  
✅ **Actionable Insights** - Specific recommendations  
✅ **Contradiction Detection** - Spots sentiment gaps  

## Usage

```bash
# Install dependencies
npm install

# Run analysis
npm test

# Or directly
node test-sentiment.js
```

## Perfect For

- **Brand monitoring**: Tweet vs public reaction
- **Campaign analysis**: Real sentiment vs replies
- **Crisis detection**: Contradiction alerts
- **Engagement insights**: What resonates vs what doesn't

## Example Scenarios

- ✅ **Positive tweet, negative replies** → Pricing concerns
- ✅ **Negative complaint, supportive replies** → Community loyalty  
- ✅ **Neutral announcement, excited replies** → Underestimated impact
- ✅ **Mixed reactions** → Detailed breakdown and themes

---

**Ready to understand real Twitter sentiment beyond simple keywords!**