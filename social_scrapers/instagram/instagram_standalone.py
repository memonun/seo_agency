"""
Instagram Standalone Scraper - Parameter-based version
Accepts direct hashtag or profile URL input and outputs to JSON
No database dependencies required
"""

import os
import json
import time
import argparse
import math
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse
from dotenv import load_dotenv
from apify_client import ApifyClient
import pandas as pd
import logging

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class InstagramStandaloneScraper:
    """Standalone Instagram scraper that outputs to JSON"""

    def __init__(self, test_mode=False, scrape_comments=True, comments_limit=None):
        # Environment variables
        self.apify_token = os.getenv("APIFY_API_TOKEN")

        if not self.apify_token:
            raise ValueError("APIFY_API_TOKEN not found in environment variables")

        # Client setup
        self.apify = ApifyClient(self.apify_token)

        # Actor ID
        self.actor_id = 'apify/instagram-scraper'

        # Test mode settings
        self.test_mode = test_mode
        self.results_limit = 5 if test_mode else 200

        # Comment scraping settings
        self.scrape_comments = scrape_comments
        self.comments_limit = comments_limit if comments_limit else (10 if test_mode else 50)

        logger.info(f"Instagram Standalone Scraper initialized")
        logger.info(f"Test mode: {test_mode}, Results limit: {self.results_limit}")
        logger.info(f"Scrape comments: {scrape_comments}, Comments limit: {self.comments_limit}")

    def parse_input(self, input_str: str, input_type: Optional[str] = None) -> Dict[str, str]:
        """
        Parse input to detect if it's a hashtag or profile URL
        Returns: {'type': 'hashtag'|'profile', 'value': str}
        """
        input_str = input_str.strip()

        # If type is explicitly specified, use it
        if input_type:
            if input_type == 'hashtag':
                return {'type': 'hashtag', 'value': input_str.strip('#')}
            elif input_type == 'profile':
                if input_str.startswith('http'):
                    return {'type': 'profile', 'value': input_str}
                else:
                    return {'type': 'profile', 'value': f"https://www.instagram.com/{input_str}/"}

        # Auto-detect based on input format
        if input_str.startswith('http'):
            # It's a URL - check if it's Instagram
            parsed = urlparse(input_str)
            if 'instagram.com' in parsed.netloc:
                return {'type': 'profile', 'value': input_str}
            else:
                raise ValueError(f"Invalid Instagram URL: {input_str}")
        else:
            # Assume it's a hashtag
            return {'type': 'hashtag', 'value': input_str.strip('#')}

    def prepare_hashtag_input(self, hashtag: str) -> Dict:
        """Prepare Apify input for hashtag scraping"""
        clean_hashtag = hashtag.strip('#')

        return {
            "addParentData": False,
            "enhanceUserSearchWithFacebookPage": False,
            "isUserReelFeedURL": False,
            "isUserTaggedFeedURL": False,
            "resultsLimit": self.results_limit,
            "resultsType": "posts",  # Changed from "details" to "posts" to get actual posts
            "searchType": "hashtag",
            "searchLimit": self.results_limit,
            "search": clean_hashtag
        }

    def prepare_profile_input(self, profile_url: str) -> Dict:
        """Prepare Apify input for profile scraping"""
        return {
            "addParentData": False,
            "directUrls": [profile_url],
            "enhanceUserSearchWithFacebookPage": False,
            "isUserReelFeedURL": False,
            "isUserTaggedFeedURL": False,
            "resultsLimit": self.results_limit,
            "resultsType": "posts",
            "searchType": "hashtag"
        }

    def run_actor_and_get_results(self, run_input: Dict) -> pd.DataFrame:
        """Run Apify actor and get results as DataFrame"""
        try:
            logger.info("Starting Apify actor...")

            # Run actor
            run = self.apify.actor(self.actor_id).call(run_input=run_input)

            # Get dataset
            dataset_id = run['defaultDatasetId']
            logger.info(f"Actor completed. Dataset ID: {dataset_id}")

            # Fetch results
            dataset_client = self.apify.dataset(dataset_id)
            items = dataset_client.list_items(limit=self.results_limit * 2).items

            logger.info(f"Retrieved {len(items)} items from dataset")

            if items:
                return pd.DataFrame(items)
            return pd.DataFrame()

        except Exception as e:
            logger.error(f"Error running actor: {e}")
            return pd.DataFrame()

    def _extract_hashtags(self, text: str) -> List[str]:
        """Extract hashtags from text"""
        if not text:
            return []
        pattern = r'#[\w\u0080-\uFFFF]+'
        hashtags = re.findall(pattern, text)
        return list(set(hashtags))[:30]

    def _extract_mentions(self, text: str) -> List[str]:
        """Extract mentions from text"""
        if not text:
            return []
        pattern = r'@[\w\.]+'
        mentions = re.findall(pattern, text)
        return list(set(mentions))[:30]

    def normalize_hashtag_data(self, df: pd.DataFrame, hashtag: str) -> Dict:
        """Normalize hashtag data to JSON format"""
        logger.info(f"Processing hashtag data for #{hashtag}")

        if df.empty:
            logger.warning(f"No data for hashtag #{hashtag}")
            return None

        hashtag_clean = hashtag.strip('#').lower()
        posts_data = []
        total_engagement = 0
        unique_users = set()

        # When using resultsType: "posts", each row IS a post (not a hashtag with nested posts)
        for idx, row in df.iterrows():
            try:
                # Check if it's a valid post
                post_type = row.get('type', '')
                if post_type:
                    valid_types = ['Image', 'Video', 'Sidecar', 'Carousel', 'GraphImage', 'GraphVideo', 'GraphSidecar']
                    if not any(post_type.lower() == t.lower() for t in valid_types):
                        continue

                post_id = row.get('id') or row.get('pk') or row.get('shortCode')
                if not post_id or pd.isna(post_id):
                    continue

                # Clean caption
                caption = str(row.get('caption', '')).replace('\\n', '\n')[:500]
                likes = int(row.get('likesCount', 0)) if not pd.isna(row.get('likesCount')) else 0
                comments = int(row.get('commentsCount', 0)) if not pd.isna(row.get('commentsCount')) else 0
                owner_username = str(row.get('ownerUsername', ''))

                post_data = {
                    'id': str(post_id),
                    'shortCode': str(row.get('shortCode', '')),
                    'caption': caption,
                    'likesCount': likes,
                    'commentsCount': comments,
                    'timestamp': str(row.get('timestamp', '')),
                    'ownerUsername': owner_username,
                    'type': post_type,
                    'url': str(row.get('url', ''))
                }

                posts_data.append(post_data)
                total_engagement += likes + comments
                if owner_username:
                    unique_users.add(owner_username)

            except Exception as e:
                logger.debug(f"Error processing row {idx}: {e}")
                continue

        if not posts_data:
            logger.warning(f"No valid posts found for #{hashtag}")
            return None

        avg_engagement = total_engagement / len(posts_data) if posts_data else 0

        return {
            'hashtag_name': f"#{hashtag_clean}",
            'hashtag_slug': hashtag_clean.replace(' ', ''),
            'posts_count': len(posts_data),
            'url': f"https://www.instagram.com/explore/tags/{hashtag_clean}/",
            'posts': posts_data,  # Single array of posts
            'total_engagement': total_engagement,
            'avg_engagement': avg_engagement,
            'unique_users_count': len(unique_users)
        }

    def normalize_profile_data(self, df: pd.DataFrame) -> List[Dict]:
        """Normalize profile posts data to JSON format"""
        logger.info(f"Processing profile posts data")

        if df.empty:
            logger.warning("No profile posts data")
            return []

        posts_to_save = []

        for idx, row in df.head(self.results_limit).iterrows():
            try:
                # Check if it's a valid post
                post_type = row.get('type', '')
                if post_type:
                    valid_types = ['Image', 'Video', 'Sidecar', 'Carousel', 'GraphImage', 'GraphVideo', 'GraphSidecar']
                    if not any(post_type.lower() == t.lower() for t in valid_types):
                        continue

                # Get post ID
                post_id = (row.get('id') or row.get('pk') or
                          row.get('shortCode') or row.get('code'))

                if not post_id or pd.isna(post_id):
                    continue

                # Safe value extraction
                def safe_int(val, default=0):
                    if pd.isna(val) or val is None:
                        return default
                    try:
                        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                            return default
                        return int(val)
                    except:
                        return default

                def safe_str(val, default=""):
                    if pd.isna(val) or val is None:
                        return default
                    return str(val)

                caption = safe_str(row.get('caption'), "")[:2000]
                hashtags = self._extract_hashtags(caption)
                mentions = self._extract_mentions(caption)

                post_record = {
                    'post_id': str(post_id),
                    'short_code': safe_str(row.get('shortCode') or row.get('code')),
                    'caption': caption,
                    'post_type': post_type.lower().replace('graph', ''),
                    'likes_count': safe_int(row.get('likesCount')),
                    'comments_count': safe_int(row.get('commentsCount')),
                    'video_view_count': safe_int(row.get('videoViewCount')),
                    'owner_username': safe_str(row.get('ownerUsername')),
                    'owner_full_name': safe_str(row.get('ownerFullName')),
                    'display_url': safe_str(row.get('displayUrl')),
                    'video_url': safe_str(row.get('videoUrl')) if row.get('videoUrl') else None,
                    'url': safe_str(row.get('url')),
                    'timestamp': safe_str(row.get('timestamp')),
                    'hashtags': hashtags,
                    'mentions': mentions,
                    'hashtag_count': len(hashtags),
                    'mention_count': len(mentions),
                    'is_sponsored': bool(row.get('isSponsored')) if not pd.isna(row.get('isSponsored')) else False,
                    'location_name': safe_str(row.get('locationName'))
                }

                posts_to_save.append(post_record)

            except Exception as e:
                logger.error(f"Error processing post at index {idx}: {e}")
                continue

        logger.info(f"Processed {len(posts_to_save)} posts from profile")
        return posts_to_save

    def save_to_json(self, data: Dict, output_dir: str = None):
        """Save scraped data to JSON file"""
        if output_dir is None:
            output_dir = Path(__file__).parent.parent / 'outputs' / 'instagram'
        else:
            output_dir = Path(output_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        input_type = data['input']['type']
        input_value = data['input']['value'].replace('#', '').replace('/', '_')[:50]

        filename = f"instagram_{input_type}_{input_value}_{timestamp}.json"
        filepath = output_dir / filename

        # Write JSON file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"✅ Results saved to: {filepath}")
        return str(filepath)

    def scrape(self, input_str: str, input_type: Optional[str] = None, output_dir: Optional[str] = None) -> str:
        """
        Main scraping function
        Returns: path to saved JSON file
        """
        start_time = time.time()

        # Parse input
        input_data = self.parse_input(input_str, input_type)
        logger.info(f"Input type detected: {input_data['type']}")
        logger.info(f"Input value: {input_data['value']}")

        # Prepare result structure
        result = {
            'input': {
                'type': input_data['type'],
                'value': input_data['value'],
                'scraped_at': datetime.now().isoformat()
            },
            'metadata': {
                'test_mode': self.test_mode,
                'results_limit': self.results_limit
            },
            'results': {}
        }

        # Scrape based on type
        if input_data['type'] == 'hashtag':
            hashtag = input_data['value']
            logger.info(f"Scraping hashtag: #{hashtag}")

            apify_input = self.prepare_hashtag_input(hashtag)
            df = self.run_actor_and_get_results(apify_input)

            if not df.empty:
                hashtag_data = self.normalize_hashtag_data(df, hashtag)
                if hashtag_data:
                    result['results']['hashtag_data'] = hashtag_data
                    result['metadata']['total_posts'] = hashtag_data['posts_count']
                else:
                    result['results']['error'] = "No posts found for hashtag"
            else:
                result['results']['error'] = "No data returned from Instagram"

        elif input_data['type'] == 'profile':
            profile_url = input_data['value']
            logger.info(f"Scraping profile: {profile_url}")

            apify_input = self.prepare_profile_input(profile_url)
            df = self.run_actor_and_get_results(apify_input)

            if not df.empty:
                posts = self.normalize_profile_data(df)
                if posts:
                    result['results']['profile_data'] = {
                        'url': profile_url,
                        'posts': posts
                    }
                    result['metadata']['total_posts'] = len(posts)
                else:
                    result['results']['error'] = "No posts found for profile"
            else:
                result['results']['error'] = "No data returned from Instagram"

        # Add duration
        duration = time.time() - start_time
        result['metadata']['scrape_duration_seconds'] = round(duration, 2)

        # Save to JSON
        output_path = self.save_to_json(result, output_dir)

        logger.info(f"\n{'='*60}")
        logger.info(f"✅ SCRAPING COMPLETED")
        logger.info(f"{'='*60}")
        logger.info(f"Type: {input_data['type']}")
        logger.info(f"Posts: {result['metadata'].get('total_posts', 0)}")
        logger.info(f"Duration: {duration:.2f}s")
        logger.info(f"Output: {output_path}")
        logger.info(f"{'='*60}\n")

        return output_path


def main():
    """CLI interface"""
    parser = argparse.ArgumentParser(
        description='Instagram Standalone Scraper - Parameter-based version'
    )

    parser.add_argument('--input', type=str, required=True,
                       help='Hashtag (e.g., #music or music) or Profile URL')
    parser.add_argument('--type', type=str, choices=['hashtag', 'profile'],
                       help='Explicitly specify input type (optional, auto-detected if not provided)')
    parser.add_argument('--max-posts', type=int,
                       help='Maximum posts to scrape (default: 200)')
    parser.add_argument('--test', action='store_true',
                       help='Test mode (limit to 5 posts)')
    parser.add_argument('--output', type=str,
                       help='Custom output directory (default: outputs/instagram/)')

    args = parser.parse_args()

    try:
        scraper = InstagramStandaloneScraper(test_mode=args.test)

        # Override results limit if specified
        if args.max_posts:
            scraper.results_limit = args.max_posts

        output_path = scraper.scrape(
            input_str=args.input,
            input_type=args.type,
            output_dir=args.output
        )

        print(f"\n✅ Success! Results saved to:\n{output_path}\n")

    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        exit(1)


if __name__ == "__main__":
    main()
