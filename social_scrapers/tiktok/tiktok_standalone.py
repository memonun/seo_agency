"""
TikTok Standalone Scraper - Unified Page & Query Scraper

This script accepts either:
1. TikTok page URL (e.g., https://www.tiktok.com/@username)
2. Search query (e.g., "funny cats")

Automatically scrapes:
- Video metadata (stats, author, hashtags, mentions, etc.)
- Comments for each video (optional, enabled by default)

Outputs to JSON file with complete data structure.
No database dependencies required.

Usage:
  # Scrape a TikTok page
  python tiktok_standalone.py --input "https://www.tiktok.com/@username" --max-videos 50

  # Scrape a search query
  python tiktok_standalone.py --input "funny cats" --max-videos 100

  # Skip comment scraping
  python tiktok_standalone.py --input "travel tips" --no-comments

  # Custom output directory
  python tiktok_standalone.py --input "@username" --output ./my_outputs/
"""

import os
import json
import re
import time
import random
import argparse
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse, urlencode
from dotenv import load_dotenv

# Playwright imports
from playwright.sync_api import sync_playwright

# Requests for comment scraping
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

import logging

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Debug: Check if env loaded
if not os.getenv("TIKTOK_COOKIE"):
    print(f"⚠️ Warning: TIKTOK_COOKIE not loaded from {env_path}")
    print(f"⚠️ File exists: {env_path.exists()}")
    print(f"⚠️ Trying alternative .env loading...")
    # Try loading from current directory's parent as fallback
    alt_path = Path.cwd().parent / '.env'
    load_dotenv(alt_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TikTokStandaloneScraper:
    """Standalone TikTok scraper that outputs to JSON"""

    def __init__(self, scrape_comments=True, max_videos=50, max_comment_pages=5):
        # Environment variables
        self.cookie = os.getenv("TIKTOK_COOKIE")
        self.user_agent = os.getenv("TIKTOK_USER_AGENT")
        self.comments_baseqs = os.getenv("TIKTOK_COMMENTS_BASEQS")

        if not self.cookie:
            raise ValueError("TIKTOK_COOKIE not found in environment variables")
        if not self.user_agent:
            raise ValueError("TIKTOK_USER_AGENT not found in environment variables")

        # Settings
        self.scrape_comments = scrape_comments
        self.max_videos = max_videos
        self.max_comment_pages = max_comment_pages

        # HTTP Session for comment scraping
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self.user_agent,
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.tiktok.com/",
            "Cookie": self.cookie,
        })

        logger.info("TikTok Standalone Scraper initialized")
        logger.info(f"Scrape comments: {scrape_comments}")
        logger.info(f"Max videos: {max_videos}")
        logger.info(f"Max comment pages: {max_comment_pages}")

    def parse_input(self, input_str: str) -> Dict[str, str]:
        """
        Parse input to detect if it's a page URL or search query
        Returns: {'type': 'page'|'query', 'value': str}
        """
        input_str = input_str.strip()

        if input_str.startswith('http'):
            # It's a URL
            parsed = urlparse(input_str)
            if 'tiktok.com' in parsed.netloc:
                return {'type': 'page', 'value': input_str}
            else:
                raise ValueError(f"Invalid TikTok URL: {input_str}")
        else:
            # It's a search query
            return {'type': 'query', 'value': input_str}

    def scrape_page(self, page_url: str) -> List[Dict]:
        """Scrape videos from TikTok page URL using Playwright (SYNC)"""
        logger.info(f"Scraping TikTok page: {page_url}")

        videos_data = []
        processed_ids = set()

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--mute-audio'
                ]
            )

            # Check for storage_state.json (for logged-in state)
            state_file = Path(__file__).parent.parent / 'storage_state.json'
            ctx_kwargs = {}
            if state_file.exists():
                ctx_kwargs['storage_state'] = str(state_file)
                logger.info("Using storage_state.json for authenticated session")

            context = browser.new_context(**ctx_kwargs)
            page = context.new_page()

            # Intercept API responses for page videos
            def handle_response(response):
                try:
                    # Page mode uses /api/post/item_list
                    if '/api/post/item_list' in response.url and response.status == 200:
                        if 'application/json' in response.headers.get('content-type', ''):
                            # Get response text and strip JavaScript wrapper
                            text = response.text()
                            # Remove "for(;;);" wrapper if present
                            text = re.sub(r"^\s*for\s*\(.*?\);\s*", "", text)
                            data = json.loads(text)

                            item_list = data.get('itemList', [])

                            if item_list:
                                logger.info(f"    📡 API captured: {len(item_list)} videos")

                                for item in item_list:
                                    if item and item.get('id') not in processed_ids:
                                        video = self._parse_video_from_api(item)
                                        if video:
                                            videos_data.append(video)
                                            processed_ids.add(item['id'])

                                            if len(videos_data) >= self.max_videos:
                                                return
                except Exception as e:
                    logger.debug(f"    ⚠️ Response parse error: {e}")

            page.on('response', handle_response)

            try:
                # Navigate to page (no wait_until - let it load naturally)
                page.goto(page_url, timeout=30000)
                time.sleep(3)

                # Scroll to load more videos (similar to working script)
                scroll_count = 0
                max_scrolls = 15
                idle_count = 0
                max_idle = 5
                prev_count = 0

                while len(videos_data) < self.max_videos and scroll_count < max_scrolls and idle_count < max_idle:
                    page.evaluate('window.scrollBy(0, 1000)')  # Scroll by 1000px like working script
                    time.sleep(0.35)  # 350ms like working script
                    scroll_count += 1

                    # Check if we're making progress
                    if len(videos_data) == prev_count:
                        idle_count += 1
                    else:
                        idle_count = 0
                        prev_count = len(videos_data)

                    if scroll_count % 10 == 0:
                        logger.info(f"Scrolled {scroll_count} times, found {len(videos_data)} videos")

                # Final wait
                time.sleep(1.5)

            except Exception as e:
                logger.error(f"Error scraping page: {e}")
            finally:
                browser.close()

        logger.info(f"Scraped {len(videos_data)} videos from page")
        return videos_data[:self.max_videos]

    def scrape_query(self, query: str) -> List[Dict]:
        """Scrape videos from TikTok search query using Playwright (SYNC)"""
        logger.info(f"Scraping TikTok query: {query}")

        # Build search URL (without /video - this is the fix!)
        from urllib.parse import quote
        search_url = f"https://www.tiktok.com/search?q={quote(query)}"

        videos_data = []
        processed_ids = set()

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            )

            context = browser.new_context(
                viewport={'width': 1280, 'height': 720},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )

            page = context.new_page()

            # Collect API responses in array (not process immediately!)
            api_responses = []

            def handle_response(response):
                # Check correct API endpoints
                if 'api/search/general/full' in response.url or \
                   'api/post/item_list' in response.url or \
                   'api/search/general/preview' in response.url:
                    try:
                        data = response.json()  # No await - sync!
                        api_responses.append(data)
                        logger.info(f"    📡 API captured: {response.url[:60]}...")
                    except Exception as e:
                        logger.debug(f"    ⚠️ Response parse error: {e}")

            page.on("response", handle_response)

            try:
                # Navigate with domcontentloaded (not networkidle!)
                page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                time.sleep(3)

                # Scroll to load more videos
                for i in range(5):
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    time.sleep(2)

                    # Process API responses AFTER scrolling
                    for response_data in api_responses:
                        self._process_api_response(response_data, query, videos_data, processed_ids)

                    if len(videos_data) >= self.max_videos:
                        break

            except Exception as e:
                logger.error(f"Error scraping query: {e}")
            finally:
                browser.close()

        logger.info(f"Scraped {len(videos_data)} videos from query")
        return videos_data[:self.max_videos]

    def _process_api_response(self, data: dict, query: str, videos_data: list, processed_ids: set):
        """Process API response and extract video data"""
        videos_found = []

        try:
            # Check data.data list with sections (Type 1 pattern)
            if 'data' in data and isinstance(data['data'], list):
                for section in data['data']:
                    if isinstance(section, dict):
                        # Type 1: Video items
                        if section.get('type') == 1 and 'item' in section:
                            item = section['item']
                            if item and item.get('id') not in processed_ids:
                                videos_found.append(item)
                                processed_ids.add(item['id'])

            # Check itemList format
            if 'itemList' in data and isinstance(data['itemList'], list):
                for item in data['itemList']:
                    if item and item.get('id') not in processed_ids:
                        videos_found.append(item)
                        processed_ids.add(item['id'])

            # Parse and add videos
            for item in videos_found:
                video_data = self._parse_video_from_api(item, query)
                if video_data:
                    videos_data.append(video_data)

            logger.debug(f"  📦 API response: {len(videos_found)} items")

        except Exception as e:
            logger.debug(f"  ❌ API response processing error: {e}")

    def _parse_video_from_api(self, item: Dict, query: str = "") -> Optional[Dict]:
        """Parse video data from TikTok API response"""
        try:
            video_id = item.get('id')
            if not video_id:
                return None

            stats = item.get('stats') or {}
            statsV2 = item.get('statsV2') or {}
            author = item.get('author') or {}
            authorStats = item.get('authorStats') or {}
            video_data = item.get('video') or {}
            music = item.get('music') or {}

            # Calculate engagement metrics (use statsV2 if available, fallback to stats)
            # Helper to safely convert to int
            def _to_int(val):
                try:
                    if val is None:
                        return 0
                    return int(val)
                except (ValueError, TypeError):
                    return 0

            likes = _to_int(statsV2.get('diggCount') or stats.get('diggCount'))
            comments = _to_int(statsV2.get('commentCount') or stats.get('commentCount'))
            shares = _to_int(statsV2.get('shareCount') or stats.get('shareCount'))
            reposts = _to_int(statsV2.get('collectCount') or stats.get('collectCount'))
            views = _to_int(statsV2.get('playCount') or stats.get('playCount'))

            engagement = likes + comments + shares + reposts
            engagement_rate = (engagement / views * 100) if views > 0 else 0.0

            # Extract hashtags from challenges array (like working scripts)
            hashtags = []
            challenges = item.get('challenges', [])
            for challenge in challenges:
                if challenge.get('title'):
                    hashtags.append(challenge.get('title'))

            # Extract mentions from textExtra
            mentions = []
            for text_extra in item.get('textExtra', []):
                if text_extra.get('type') == 0:  # Type 0 = mention
                    user_id = text_extra.get('userUniqueId')
                    if user_id:
                        mentions.append(user_id)

            # Get description (handle different formats)
            desc = item.get('desc', '')
            if not desc:
                contents = item.get('contents')
                if isinstance(contents, dict):
                    desc = contents.get('desc', '')
                elif isinstance(contents, list) and contents and isinstance(contents[0], dict):
                    desc = contents[0].get('desc', '')

            return {
                'video_id': str(video_id),
                'desc': desc,
                'create_time': item.get('createTime', 0),
                'search_query': query,
                'author': {
                    'id': author.get('id'),
                    'unique_id': author.get('uniqueId'),
                    'nickname': author.get('nickname'),
                    'verified': author.get('verified', False),
                    'signature': author.get('signature', ''),
                    'follower_count': _to_int(authorStats.get('followerCount')),
                    'following_count': _to_int(authorStats.get('followingCount')),
                    'heart_count': _to_int(authorStats.get('heart')),
                    'video_count': _to_int(authorStats.get('videoCount'))
                },
                'stats': {
                    'play_count': views,
                    'digg_count': likes,
                    'comment_count': comments,
                    'share_count': shares,
                    'repost_count': reposts,
                    'engagement_rate': round(engagement_rate, 2)
                },
                'video': {
                    'duration': _to_int(video_data.get('duration')),
                    'ratio': video_data.get('ratio'),
                    'cover': video_data.get('cover')
                },
                'music': {
                    'id': music.get('id'),
                    'title': music.get('title'),
                    'author': music.get('authorName'),
                    'original': music.get('original', False)
                },
                'hashtags': hashtags,
                'mentions': mentions,
                'is_ad': item.get('isAd', False),
                'is_duet': bool(item.get('duetInfo')),
                'is_stitch': bool(item.get('stitchInfo'))
            }

        except Exception as e:
            logger.error(f"Error parsing video: {e}")
            return None

    def scrape_comments_for_video(self, video_id: str) -> Dict:
        """Scrape comments for a specific video"""
        if not self.scrape_comments:
            return {'video_id': video_id, 'comments': [], 'total_comments': 0}

        logger.info(f"  Scraping comments for video {video_id}")

        all_comments = []
        cursor = 0
        page = 0

        while page < self.max_comment_pages:
            try:
                data = self._fetch_comment_page(video_id, cursor)
                comments = data.get('comments') or []

                for c in comments:
                    user = c.get('user') or {}
                    comment_data = {
                        'comment_id': str(c.get('cid')),
                        'text': c.get('text'),
                        'user': {
                            'uid': user.get('uid'),
                            'unique_id': user.get('unique_id'),
                            'nickname': user.get('nickname'),
                            'verified': user.get('verified', False)
                        },
                        'like_count': c.get('digg_count', 0),
                        'reply_count': c.get('reply_comment_total', 0),
                        'create_time': c.get('create_time'),
                        'is_author_liked': bool(c.get('is_author_digged'))
                    }
                    all_comments.append(comment_data)

                has_more = bool(int(data.get('has_more', 0)) == 1)
                if not has_more:
                    break

                cursor = int(data.get('cursor', 0))
                page += 1

                # Rate limiting
                time.sleep(0.7 + random.uniform(0.0, 0.3))

            except Exception as e:
                logger.error(f"  Error fetching comments: {e}")
                break

        logger.info(f"  Scraped {len(all_comments)} comments ({page} pages)")

        return {
            'video_id': video_id,
            'total_comments': len(all_comments),
            'comments': all_comments
        }

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((requests.RequestException,))
    )
    def _fetch_comment_page(self, video_id: str, cursor: int = 0) -> Dict:
        """Fetch a single page of comments from TikTok API"""
        if not self.comments_baseqs:
            return {'comments': [], 'has_more': 0}

        params = {}
        for chunk in self.comments_baseqs.split("&"):
            if "=" in chunk:
                k, v = chunk.split("=", 1)
                params[k] = v

        params["aweme_id"] = str(video_id)
        params["cursor"] = str(cursor)
        params.setdefault("count", "20")

        url = f"https://www.tiktok.com/api/comment/list/?{urlencode(params)}"

        try:
            resp = self.session.get(url, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            else:
                logger.warning(f"Comment API returned status {resp.status_code}")
                return {'comments': [], 'has_more': 0}
        except Exception as e:
            logger.error(f"Error fetching comments: {e}")
            return {'comments': [], 'has_more': 0}

    def save_to_json(self, data: Dict, output_dir: str = None) -> str:
        """Save scraped data to JSON file"""
        if output_dir is None:
            output_dir = Path(__file__).parent.parent / 'outputs' / 'tiktok'
        else:
            output_dir = Path(output_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        input_type = data['input']['type']
        input_value = data['input']['value'].replace('/', '_').replace('@', '')[:50]

        filename = f"tiktok_{input_type}_{input_value}_{timestamp}.json"
        filepath = output_dir / filename

        # Write JSON file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"✅ Results saved to: {filepath}")
        return str(filepath)

    def scrape(self, input_str: str, output_dir: Optional[str] = None) -> str:
        """
        Main scraping function
        Returns: path to saved JSON file
        """
        start_time = time.time()

        # Parse input
        input_data = self.parse_input(input_str)
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
                'max_videos': self.max_videos,
                'scrape_comments': self.scrape_comments,
                'max_comment_pages': self.max_comment_pages
            },
            'videos': [],
            'comments': {}
        }

        # Scrape videos based on type
        if input_data['type'] == 'page':
            videos = self.scrape_page(input_data['value'])
        elif input_data['type'] == 'query':
            videos = self.scrape_query(input_data['value'])
        else:
            videos = []

        result['videos'] = videos
        result['metadata']['total_videos'] = len(videos)

        # Scrape comments for each video
        if self.scrape_comments and videos:
            logger.info(f"\n{'='*60}")
            logger.info(f"Scraping comments for {len(videos)} videos...")
            logger.info(f"{'='*60}\n")

            total_comments = 0
            for i, video in enumerate(videos, 1):
                video_id = video['video_id']
                logger.info(f"[{i}/{len(videos)}] Video {video_id}")

                comment_data = self.scrape_comments_for_video(video_id)
                result['comments'][video_id] = comment_data
                total_comments += comment_data['total_comments']

                # Rate limiting between videos
                if i < len(videos):
                    time.sleep(1 + random.uniform(0, 0.5))

            result['metadata']['total_comments'] = total_comments
            logger.info(f"\n✅ Scraped {total_comments} total comments")

        # Add duration
        duration = time.time() - start_time
        result['metadata']['scrape_duration_seconds'] = round(duration, 2)

        # Save to JSON
        output_path = self.save_to_json(result, output_dir)

        logger.info(f"\n{'='*60}")
        logger.info(f"✅ SCRAPING COMPLETED")
        logger.info(f"{'='*60}")
        logger.info(f"Type: {input_data['type']}")
        logger.info(f"Videos: {len(videos)}")
        logger.info(f"Comments: {result['metadata'].get('total_comments', 0)}")
        logger.info(f"Duration: {duration:.2f}s")
        logger.info(f"Output: {output_path}")
        logger.info(f"{'='*60}\n")

        return output_path


def main():
    """CLI interface"""
    parser = argparse.ArgumentParser(
        description='TikTok Standalone Scraper - Parameter-based unified version'
    )

    parser.add_argument('--input', type=str, required=True,
                       help='TikTok page URL (e.g., https://www.tiktok.com/@user) or search query (e.g., "funny cats")')
    parser.add_argument('--max-videos', type=int, default=50,
                       help='Maximum videos to scrape (default: 50)')
    parser.add_argument('--no-comments', action='store_true',
                       help='Skip comment scraping')
    parser.add_argument('--max-pages', type=int, default=5,
                       help='Maximum comment pages per video (default: 5)')
    parser.add_argument('--output', type=str,
                       help='Custom output directory (default: outputs/tiktok/)')

    args = parser.parse_args()

    try:
        scraper = TikTokStandaloneScraper(
            scrape_comments=not args.no_comments,
            max_videos=args.max_videos,
            max_comment_pages=args.max_pages
        )

        output_path = scraper.scrape(
            input_str=args.input,
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
