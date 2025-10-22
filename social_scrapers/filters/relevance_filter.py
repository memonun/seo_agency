"""
Relevance Filter - LLM-based content classification
Filters social media posts based on campaign relevance using AI
"""

import os
import json
import argparse
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
import logging
from openai import OpenAI

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RelevanceFilter:
    """
    AI-powered relevance filter for social media content
    Classifies posts as relevant/irrelevant based on campaign context
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        batch_size: int = 15,
        confidence_threshold: float = 0.6
    ):
        """
        Initialize the relevance filter

        Args:
            model: OpenAI model to use (default: gpt-4o-mini for speed and cost)
            batch_size: Number of posts to process per API call
            confidence_threshold: Minimum confidence score (0-1) to mark as relevant
        """
        self.openai_api_key = os.getenv("OPENAI_API_KEY")

        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")

        self.client = OpenAI(api_key=self.openai_api_key)
        self.model = model
        self.batch_size = batch_size
        self.confidence_threshold = confidence_threshold

        logger.info(f"RelevanceFilter initialized with model: {model}")
        logger.info(f"Batch size: {batch_size}, Threshold: {confidence_threshold}")

    def extract_content_text(self, post: Dict, platform: str) -> str:
        """
        Extract text content from post based on platform

        Args:
            post: Post data dictionary
            platform: Platform name (tiktok, instagram, youtube, etc.)

        Returns:
            Combined text content from post
        """
        content_parts = []

        if platform == "tiktok":
            # TikTok structure
            if desc := post.get('desc'):
                content_parts.append(f"Description: {desc}")

            if author := post.get('author', {}).get('nickname'):
                content_parts.append(f"Author: {author}")

            if music := post.get('music', {}).get('title'):
                content_parts.append(f"Music: {music}")

        elif platform == "instagram":
            # Instagram structure
            if caption := post.get('caption'):
                content_parts.append(f"Caption: {caption}")

            if owner := post.get('owner_username'):
                content_parts.append(f"Owner: {owner}")

            if hashtags := post.get('hashtags'):
                content_parts.append(f"Hashtags: {', '.join(hashtags)}")

            if mentions := post.get('mentions'):
                content_parts.append(f"Mentions: {', '.join(mentions)}")

        return "\n".join(content_parts) if content_parts else "No content available"

    def create_classification_prompt(
        self,
        posts_batch: List[Dict],
        campaign_context: str,
        platform: str
    ) -> str:
        """
        Create classification prompt for batch of posts

        Args:
            posts_batch: List of posts to classify
            campaign_context: Campaign description/context
            platform: Platform name

        Returns:
            Formatted prompt string
        """
        posts_text = []
        for idx, post in enumerate(posts_batch):
            content = self.extract_content_text(post, platform)
            post_id = post.get('video_id') or post.get('post_id') or post.get('id', f'unknown_{idx}')
            posts_text.append(f"POST_{idx} (ID: {post_id}):\n{content}\n")

        prompt = f"""You are a content relevance classifier for social media marketing campaigns.

CAMPAIGN CONTEXT:
{campaign_context}

TASK:
Analyze each post below and determine if it's relevant to the campaign context.

POSTS TO CLASSIFY:
{chr(10).join(posts_text)}

INSTRUCTIONS:
For each post, provide a JSON object with:
- post_index: The post number (0, 1, 2, etc.)
- relevant: true/false
- confidence: 0.0 to 1.0 (how confident you are)
- reasoning: Brief explanation (1-2 sentences)

Return ONLY a JSON array with classification results. No additional text.

Example format:
[
  {{"post_index": 0, "relevant": true, "confidence": 0.85, "reasoning": "Directly mentions campaign topic"}},
  {{"post_index": 1, "relevant": false, "confidence": 0.95, "reasoning": "Unrelated content about different topic"}}
]
"""
        return prompt

    def classify_batch(
        self,
        posts_batch: List[Dict],
        campaign_context: str,
        platform: str
    ) -> List[Dict]:
        """
        Classify a batch of posts using LLM

        Args:
            posts_batch: List of posts to classify
            campaign_context: Campaign description
            platform: Platform name

        Returns:
            List of classification results
        """
        try:
            prompt = self.create_classification_prompt(posts_batch, campaign_context, platform)

            logger.info(f"Classifying batch of {len(posts_batch)} posts...")

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a precise content relevance classifier. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,  # Lower temperature for more consistent results
                max_tokens=2000
            )

            # Parse response
            response_text = response.choices[0].message.content.strip()

            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            classifications = json.loads(response_text)

            logger.info(f"✅ Classified {len(classifications)} posts")
            return classifications

        except Exception as e:
            logger.error(f"Error classifying batch: {e}")
            # Return default classifications on error
            return [
                {
                    "post_index": idx,
                    "relevant": False,
                    "confidence": 0.0,
                    "reasoning": f"Classification error: {str(e)}"
                }
                for idx in range(len(posts_batch))
            ]

    def filter_content(
        self,
        input_file: str,
        campaign_context: str,
        output_dir: Optional[str] = None
    ) -> Dict:
        """
        Main filtering function

        Args:
            input_file: Path to input JSON file
            campaign_context: Campaign description for relevance checking
            output_dir: Output directory (default: outputs/filtered/)

        Returns:
            Dictionary with filtering results and metadata
        """
        start_time = time.time()

        # Load input file
        logger.info(f"Loading input file: {input_file}")
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Detect platform and extract posts
        input_meta = data.get('input', {})
        platform = self._detect_platform(input_file, data)

        posts = self._extract_posts(data, platform)
        total_posts = len(posts)

        if total_posts == 0:
            logger.warning("No posts found in input file")
            return self._create_empty_result(input_file, campaign_context, platform)

        logger.info(f"Found {total_posts} posts from platform: {platform}")
        logger.info(f"Campaign context: {campaign_context[:100]}...")

        # Process posts in batches
        all_classifications = []
        for i in range(0, total_posts, self.batch_size):
            batch = posts[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            total_batches = (total_posts + self.batch_size - 1) // self.batch_size

            logger.info(f"Processing batch {batch_num}/{total_batches}")

            classifications = self.classify_batch(batch, campaign_context, platform)
            all_classifications.extend(classifications)

            # Small delay to avoid rate limits
            if i + self.batch_size < total_posts:
                time.sleep(0.5)

        # Apply classifications to posts
        relevant_posts = []
        irrelevant_posts = []
        borderline_posts = []

        for idx, post in enumerate(posts):
            if idx < len(all_classifications):
                classification = all_classifications[idx]

                # Add classification to post
                post['_classification'] = {
                    'relevant': classification.get('relevant', False),
                    'confidence': classification.get('confidence', 0.0),
                    'reasoning': classification.get('reasoning', '')
                }

                # Categorize post
                confidence = classification.get('confidence', 0.0)
                is_relevant = classification.get('relevant', False)

                if is_relevant and confidence >= self.confidence_threshold:
                    relevant_posts.append(post)
                elif is_relevant and confidence < self.confidence_threshold:
                    borderline_posts.append(post)
                else:
                    irrelevant_posts.append(post)

        # Create result
        duration = time.time() - start_time

        result = {
            'input': {
                'file': str(input_file),
                'platform': platform,
                'original_input': input_meta,
                'filtered_at': datetime.now().isoformat()
            },
            'filter_config': {
                'campaign_context': campaign_context,
                'model': self.model,
                'confidence_threshold': self.confidence_threshold,
                'batch_size': self.batch_size
            },
            'statistics': {
                'total_posts': total_posts,
                'relevant_posts': len(relevant_posts),
                'irrelevant_posts': len(irrelevant_posts),
                'borderline_posts': len(borderline_posts),
                'relevance_rate': round(len(relevant_posts) / total_posts * 100, 2) if total_posts > 0 else 0,
                'processing_duration_seconds': round(duration, 2)
            },
            'relevant_posts': relevant_posts,
            'borderline_posts': borderline_posts,
            'irrelevant_posts': irrelevant_posts  # Include for review
        }

        # Save result
        output_path = self._save_result(result, input_file, output_dir)

        # Log summary
        self._log_summary(result, output_path)

        return result

    def _detect_platform(self, input_file: str, data: Dict) -> str:
        """Detect platform from file path or data structure"""
        file_str = str(input_file).lower()

        if 'tiktok' in file_str:
            return 'tiktok'
        elif 'instagram' in file_str:
            return 'instagram'
        elif 'youtube' in file_str:
            return 'youtube'

        # Try to detect from data structure
        if 'videos' in data:
            return 'tiktok'
        elif 'posts' in data.get('results', {}).get('profile_data', {}):
            return 'instagram'

        return 'unknown'

    def _extract_posts(self, data: Dict, platform: str) -> List[Dict]:
        """Extract posts array based on platform"""
        if platform == 'tiktok':
            return data.get('videos', [])
        elif platform == 'instagram':
            profile_data = data.get('results', {}).get('profile_data', {})
            hashtag_data = data.get('results', {}).get('hashtag_data', {})
            return profile_data.get('posts', []) or hashtag_data.get('posts', [])

        # Try common structures
        return data.get('posts', []) or data.get('items', []) or []

    def _create_empty_result(self, input_file: str, campaign_context: str, platform: str) -> Dict:
        """Create empty result structure"""
        return {
            'input': {
                'file': str(input_file),
                'platform': platform,
                'filtered_at': datetime.now().isoformat()
            },
            'filter_config': {
                'campaign_context': campaign_context,
                'model': self.model,
                'confidence_threshold': self.confidence_threshold
            },
            'statistics': {
                'total_posts': 0,
                'relevant_posts': 0,
                'irrelevant_posts': 0,
                'borderline_posts': 0,
                'relevance_rate': 0
            },
            'relevant_posts': [],
            'borderline_posts': [],
            'irrelevant_posts': []
        }

    def _save_result(self, result: Dict, input_file: str, output_dir: Optional[str]) -> str:
        """Save filtered result to JSON"""
        if output_dir is None:
            output_dir = Path(__file__).parent.parent / 'outputs' / 'filtered'
        else:
            output_dir = Path(output_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename
        input_path = Path(input_file)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"filtered_{input_path.stem}_{timestamp}.json"
        filepath = output_dir / filename

        # Write JSON
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        logger.info(f"✅ Filtered results saved to: {filepath}")
        return str(filepath)

    def _log_summary(self, result: Dict, output_path: str):
        """Log filtering summary"""
        stats = result['statistics']

        print(f"\n{'='*70}")
        print(f"🎯 RELEVANCE FILTERING COMPLETED")
        print(f"{'='*70}")
        print(f"Platform: {result['input']['platform'].upper()}")
        print(f"Total posts: {stats['total_posts']}")
        print(f"✅ Relevant: {stats['relevant_posts']} ({stats['relevance_rate']}%)")
        print(f"⚠️  Borderline: {stats['borderline_posts']}")
        print(f"❌ Irrelevant: {stats['irrelevant_posts']}")
        print(f"⏱️  Duration: {stats['processing_duration_seconds']}s")
        print(f"📁 Output: {output_path}")
        print(f"{'='*70}\n")


def main():
    """CLI interface"""
    parser = argparse.ArgumentParser(
        description='Relevance Filter - AI-powered content classification for social media'
    )

    parser.add_argument('--input', type=str, required=True,
                       help='Path to input JSON file from scraper')
    parser.add_argument('--context', type=str, required=True,
                       help='Campaign context description (what content is relevant?)')
    parser.add_argument('--model', type=str, default='gpt-4o-mini',
                       help='OpenAI model to use (default: gpt-4o-mini)')
    parser.add_argument('--batch-size', type=int, default=15,
                       help='Number of posts per API call (default: 15)')
    parser.add_argument('--threshold', type=float, default=0.6,
                       help='Confidence threshold 0-1 (default: 0.6)')
    parser.add_argument('--output', type=str,
                       help='Custom output directory (default: outputs/filtered/)')

    args = parser.parse_args()

    try:
        filter_engine = RelevanceFilter(
            model=args.model,
            batch_size=args.batch_size,
            confidence_threshold=args.threshold
        )

        result = filter_engine.filter_content(
            input_file=args.input,
            campaign_context=args.context,
            output_dir=args.output
        )

        print(f"\n✅ Success! Check the output file for filtered results.\n")

    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        exit(1)


if __name__ == "__main__":
    main()
