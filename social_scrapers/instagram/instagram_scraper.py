# instagram_scraper.py - COMPLETE FIXED VERSION

import os
import sys
from pathlib import Path
from urllib.parse import unquote

# .env dosyasını yükle
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent / '.env'  # Load from social_scrapers/.env
load_dotenv(env_path)

import time
import json
import uuid
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional
from apify_client import ApifyClient
from supabase import create_client, Client
import pandas as pd
import logging
import re
import traceback
import math  # Bunu diğer import'ların yanına ekleyin


def safe_json_dumps(obj, **kwargs):
    """NaN ve Infinity değerlerini None'a çevirerek güvenli JSON serialize et"""

    def clean_value(val):
        if isinstance(val, float):
            if math.isnan(val) or math.isinf(val):
                return None
        elif isinstance(val, dict):
            return {k: clean_value(v) for k, v in val.items()}
        elif isinstance(val, list):
            return [clean_value(item) for item in val]
        return val

    cleaned_obj = clean_value(obj)
    return json.dumps(cleaned_obj, ensure_ascii=False, **kwargs)

# Detaylı logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class InstagramApifyAutomation:
    def __init__(self, test_mode=False):
        # Environment variables
        self.apify_token = os.getenv("APIFY_API_TOKEN")
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not all([self.apify_token, self.supabase_url, self.supabase_key]):
            raise ValueError(
                "Missing required environment variables. Check APIFY_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")

        # Client setup
        self.apify = ApifyClient(self.apify_token)
        self.supabase = create_client(self.supabase_url, self.supabase_key)

        # Actor ID
        self.actor_id = 'apify/instagram-scraper'

        # Schema
        self.schema = 'social_analytics'

        # Test mode için düşük limitler
        self.test_mode = test_mode
        self.results_limit = 5 if test_mode else 10

        # Batch ID for this session
        self.batch_id = str(uuid.uuid4())

        logger.info(f"Session batch_id: {self.batch_id}")
        logger.info(f"Schema: {self.schema}")
        logger.info(f"Test mode: {test_mode}, Results limit: {self.results_limit}")

        # Test Supabase connection
        self.test_supabase_connection()

    def test_supabase_connection(self):
        """Supabase bağlantısını test et"""
        try:
            # Brands tablosunu test et
            result = self.supabase.schema(self.schema).table('brands').select('count', count='exact').execute()
            logger.info(f"✅ Supabase connection OK - Brands table accessible")

            # Instagram tablosunu test et
            result = self.supabase.schema(self.schema).table('instagram_hashtags').select('count',
                                                                                          count='exact').execute()
            logger.info(f"✅ Instagram hashtags table accessible")

            result = self.supabase.schema(self.schema).table('instagram_posts').select('count', count='exact').execute()
            logger.info(f"✅ Instagram posts table accessible")

        except Exception as e:
            logger.error(f"❌ Supabase connection error: {e}")
            raise

    def get_active_brands(self, brand_name: Optional[str] = None) -> List[Dict]:
        """Aktif markaları al"""
        try:
            query = self.supabase.schema(self.schema).table('brands').select('*').eq('is_active', True)

            if brand_name:
                query = query.eq('name', brand_name)

            response = query.execute()
            logger.info(f"Fetched {len(response.data)} brands from database")
            return response.data
        except Exception as e:
            logger.error(f"Error fetching brands: {e}")
            logger.error(traceback.format_exc())
            return []

    def prepare_hashtag_input(self, hashtag: str) -> Dict:
        """Hashtag scraper için input hazırla"""
        clean_hashtag = hashtag.strip('#')

        return {
            "addParentData": False,
            "enhanceUserSearchWithFacebookPage": False,
            "isUserReelFeedURL": False,
            "isUserTaggedFeedURL": False,
            "resultsLimit": self.results_limit,
            "resultsType": "details",
            "searchType": "hashtag",
            "searchLimit": self.results_limit,
            "search": clean_hashtag
        }

    def prepare_profile_input(self, profile_url: str) -> Dict:
        """Profile scraper için input hazırla - CORRECT VERSION"""
        return {
            "addParentData": False,
            "directUrls": [profile_url],  # Profile URL'i buraya
            "enhanceUserSearchWithFacebookPage": False,
            "isUserReelFeedURL": False,
            "isUserTaggedFeedURL": False,
            "resultsLimit": self.results_limit,
            "resultsType": "posts",  # Posts istiyoruz
            "searchType": "hashtag"  # Apify'da bu "hashtag" olarak kalıyor
        }

    def run_actor_and_get_results(self, run_input: Dict) -> pd.DataFrame:
        """Apify actor'ı çalıştır ve sonuçları DataFrame olarak al"""
        try:
            logger.info(f"Starting actor with input: {json.dumps(run_input, indent=2)}")

            # Actor'ı çalıştır
            run = self.apify.actor(self.actor_id).call(run_input=run_input)

            # Dataset'i al
            dataset_id = run['defaultDatasetId']
            logger.info(f"Run completed. Dataset ID: {dataset_id}")

            # Sonuçları çek
            dataset_client = self.apify.dataset(dataset_id)
            items = dataset_client.list_items(limit=100).items  # Daha fazla item al

            logger.info(f"Retrieved {len(items)} items from dataset")

            # Debug: İlk item'ı göster
            if items:
                logger.debug(f"Sample item keys: {items[0].keys()}")
                logger.debug(f"Sample item: {json.dumps(items[0], indent=2, default=str)[:500]}")

            if items:
                return pd.DataFrame(items)
            return pd.DataFrame()

        except Exception as e:
            logger.error(f"Error running actor: {e}")
            logger.error(traceback.format_exc())
            return pd.DataFrame()

    def _extract_hashtags(self, text: str) -> List[str]:
        """Text'ten hashtag'leri çıkar"""
        if not text:
            return []
        pattern = r'#[\w\u0080-\uFFFF]+'
        hashtags = re.findall(pattern, text)
        return list(set(hashtags))[:30]

    def _extract_mentions(self, text: str) -> List[str]:
        """Text'ten mention'ları çıkar"""
        if not text:
            return []
        pattern = r'@[\w\.]+'
        mentions = re.findall(pattern, text)
        return list(set(mentions))[:30]

    def normalize_and_insert_hashtag(self, df: pd.DataFrame, brand_id: int,
                                     sub_brand_name: str, hashtag: str):
        """Hashtag verisini normalize et ve kaydet - FIXED JSON VERSION"""
        logger.info(f"Processing hashtag data for {hashtag}")
        logger.info(f"DataFrame shape: {df.shape}")
        logger.info(f"DataFrame columns: {df.columns.tolist()}")

        if df.empty:
            logger.warning(f"No data for hashtag {hashtag}")
            return

        from urllib.parse import unquote

        hashtag_clean = hashtag.strip('#').lower()
        hashtag_slug = hashtag_clean.replace(' ', '').replace('#', '')

        # Gerçek post verilerini topla
        posts_data = []
        top_posts_data = []
        total_engagement = 0
        unique_users = set()

        # HER SATIR BİR HASHTAG - topPosts ve latestPosts içinde gerçek postlar var!
        for idx, row in df.iterrows():
            logger.debug(f"Processing hashtag row {idx}: name={row.get('name')}, postsCount={row.get('postsCount')}")

            # topPosts varsa işle
            if row.get('topPosts') and isinstance(row.get('topPosts'), list):
                logger.info(f"Found {len(row['topPosts'])} top posts")
                for post in row['topPosts'][:10]:  # Max 10 top posts
                    try:
                        if not isinstance(post, dict):
                            continue

                        post_id = post.get('id') or post.get('shortCode')
                        if not post_id:
                            continue

                        # Clean caption - remove escape characters
                        caption = ''
                        if post.get('caption'):
                            caption = str(post.get('caption'))
                            # Remove excessive escaping
                            caption = caption.replace('\\n', '\n')
                            caption = caption.replace('\\t', ' ')
                            caption = caption.replace('\\"', '"')
                            caption = caption.replace("\\'", "'")
                            caption = caption[:500]  # Limit to 500 chars

                        likes = 0
                        if post.get('likesCount'):
                            try:
                                likes = int(post.get('likesCount'))
                            except:
                                likes = 0

                        comments = 0
                        if post.get('commentsCount'):
                            try:
                                comments = int(post.get('commentsCount'))
                            except:
                                comments = 0

                        owner_username = post.get('ownerUsername', '')

                        # Create clean post object
                        post_data = {
                            'id': str(post_id),
                            'shortCode': post.get('shortCode', ''),
                            'caption': caption,
                            'likesCount': likes,
                            'commentsCount': comments,
                            'timestamp': post.get('timestamp', ''),
                            'ownerUsername': owner_username,
                            'type': post.get('type', 'Image')
                        }

                        top_posts_data.append(post_data)
                        total_engagement += likes + comments

                        if owner_username:
                            unique_users.add(owner_username)

                        logger.debug(f"Added top post: {post_id}, likes: {likes}, comments: {comments}")

                    except Exception as e:
                        logger.error(f"Error processing top post: {e}")
                        continue

            # latestPosts varsa işle
            if row.get('latestPosts') and isinstance(row.get('latestPosts'), list):
                logger.info(f"Found {len(row['latestPosts'])} latest posts")
                for post in row['latestPosts'][:10]:  # Max 10 latest posts
                    try:
                        if not isinstance(post, dict):
                            continue

                        post_id = post.get('id') or post.get('shortCode')
                        if not post_id:
                            continue

                        # Clean caption - remove escape characters
                        caption = ''
                        if post.get('caption'):
                            caption = str(post.get('caption'))
                            # Remove excessive escaping
                            caption = caption.replace('\\n', '\n')
                            caption = caption.replace('\\t', ' ')
                            caption = caption.replace('\\"', '"')
                            caption = caption.replace("\\'", "'")
                            caption = caption[:500]  # Limit to 500 chars

                        likes = 0
                        if post.get('likesCount'):
                            try:
                                likes = int(post.get('likesCount'))
                            except:
                                likes = 0

                        comments = 0
                        if post.get('commentsCount'):
                            try:
                                comments = int(post.get('commentsCount'))
                            except:
                                comments = 0

                        owner_username = post.get('ownerUsername', '')

                        # Create clean post object
                        post_data = {
                            'id': str(post_id),
                            'shortCode': post.get('shortCode', ''),
                            'caption': caption,
                            'likesCount': likes,
                            'commentsCount': comments,
                            'timestamp': post.get('timestamp', ''),
                            'ownerUsername': owner_username,
                            'type': post.get('type', 'Image')
                        }

                        posts_data.append(post_data)
                        total_engagement += likes + comments

                        if owner_username:
                            unique_users.add(owner_username)

                        logger.debug(f"Added latest post: {post_id}, likes: {likes}, comments: {comments}")

                    except Exception as e:
                        logger.error(f"Error processing latest post: {e}")
                        continue

        logger.info(f"Processed {len(posts_data)} latest posts and {len(top_posts_data)} top posts")

        if not posts_data and not top_posts_data:
            logger.warning(f"No valid posts found for {hashtag}")
            return

        avg_engagement = float(total_engagement / (len(posts_data) + len(top_posts_data))) if (
                    posts_data or top_posts_data) else 0.0

        # Create the hashtag record with properly formatted JSON
        hashtag_record = {
            'brand_id': brand_id,
            'sub_brand_name': sub_brand_name,
            'batch_id': self.batch_id,
            'hashtag_name': f"#{hashtag_clean}",
            'hashtag_slug': hashtag_slug,
            'posts_count': len(posts_data) + len(top_posts_data),
            'url': f"https://www.instagram.com/explore/tags/{hashtag_slug}/",
            'latest_posts': posts_data,  # Direct list, not JSON string
            'top_posts': top_posts_data,  # Direct list, not JSON string
            'total_engagement': total_engagement,
            'avg_engagement': avg_engagement,
            'unique_users_count': len(unique_users),
            'scraped_posts_count': len(posts_data) + len(top_posts_data),
            'related_hashtags': None,
            'scraped_at': datetime.now().isoformat()
        }

        logger.info(f"Attempting to insert hashtag record for {hashtag}")
        logger.info(f"Total engagement: {total_engagement}, Avg engagement: {avg_engagement}")

        # Debug: Show sample post structure
        if posts_data:
            logger.debug(f"Sample latest post: {json.dumps(posts_data[0], indent=2)}")
        if top_posts_data:
            logger.debug(f"Sample top post: {json.dumps(top_posts_data[0], indent=2)}")

        try:
            response = self.supabase.schema(self.schema) \
                .table('instagram_hashtags') \
                .insert(hashtag_record) \
                .execute()

            if response.data:
                logger.info(f"✅ Successfully inserted hashtag {hashtag} to instagram_hashtags")
                logger.info(f"   Inserted record ID: {response.data[0].get('id') if response.data else 'Unknown'}")

                # Verify insertion
                verify = self.supabase.schema(self.schema) \
                    .table('instagram_hashtags') \
                    .select('*') \
                    .eq('hashtag_slug', hashtag_slug) \
                    .eq('batch_id', self.batch_id) \
                    .execute()

                if verify.data and len(verify.data) > 0:
                    logger.info(f"✅ VERIFIED: Record found in database!")
                    logger.info(f"   Database record ID: {verify.data[0].get('id')}")

                    # Check JSON structure
                    if verify.data[0].get('latest_posts'):
                        logger.info(f"   Latest posts count in DB: {len(verify.data[0]['latest_posts'])}")
                    if verify.data[0].get('top_posts'):
                        logger.info(f"   Top posts count in DB: {len(verify.data[0]['top_posts'])}")
                else:
                    logger.error(f"❌ VERIFICATION FAILED: Record NOT found in database!")
            else:
                logger.error(f"❌ Insert returned no data for {hashtag}")

        except Exception as e:
            logger.error(f"❌ Error inserting hashtag {hashtag}: {e}")
            logger.error(f"Full error: {traceback.format_exc()}")

            # Try with json.dumps if direct insert fails
            try:
                logger.info("Retrying with JSON.dumps...")
                hashtag_record['latest_posts'] = json.dumps(posts_data, ensure_ascii=False)
                hashtag_record['top_posts'] = json.dumps(top_posts_data, ensure_ascii=False)

                response = self.supabase.schema(self.schema) \
                    .table('instagram_hashtags') \
                    .insert(hashtag_record) \
                    .execute()

                if response.data:
                    logger.info(f"✅ Successfully inserted with JSON.dumps!")
            except Exception as e2:
                logger.error(f"❌ Retry also failed: {e2}")

    def normalize_and_insert_posts(self, df: pd.DataFrame, brand_id: int,
                                   sub_brand_name: str):
        """Posts verisini normalize et ve kaydet - NaN SAFE VERSION"""
        logger.info(f"Processing posts data for {sub_brand_name}")
        logger.info(f"DataFrame shape: {df.shape}")
        logger.info(f"DataFrame columns: {df.columns.tolist()}")

        if df.empty:
            logger.warning(f"No posts data for {sub_brand_name}")
            return

        posts_to_insert = []

        # Debug: İlk satırı göster
        if not df.empty:
            first_row = df.iloc[0].to_dict()
            logger.debug(f"First row keys: {list(first_row.keys())}")
            logger.debug(f"Sample post type: {first_row.get('type')}")
            logger.debug(f"Sample post id: {first_row.get('id')}")

        for idx, row in df.head(self.results_limit).iterrows():
            try:
                # Post type kontrolü
                # Post type kontrolü - CASE INSENSITIVE
                post_type = row.get('type')
                if post_type:
                    post_type = post_type.strip()  # Boşlukları temizle
                    # Büyük/küçük harf duyarsız kontrol
                    valid_types = ['Image', 'Video', 'Sidecar', 'Carousel', 'GraphImage', 'GraphVideo', 'GraphSidecar']
                    if not any(post_type.lower() == t.lower() for t in valid_types):
                        logger.debug(f"Row {idx} is not a valid post (type={post_type}), skipping")
                        continue
                else:
                    logger.debug(f"Row {idx} has no type field, skipping")
                    continue

                # Post ID kontrolü
                post_id = (row.get('id') or
                           row.get('pk') or
                           row.get('shortCode') or
                           row.get('code'))

                if not post_id or pd.isna(post_id):
                    logger.debug(f"Skipping row {idx} with no valid ID")
                    continue

                # Safe conversion functions - NaN kontrolü eklendi
                def safe_int(value, default=0):
                    if pd.isna(value) or value is None:
                        return default
                    try:
                        # Float NaN kontrolü
                        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                            return default
                        return int(value)
                    except:
                        return default

                def safe_float(value, default=None):
                    if pd.isna(value) or value is None:
                        return default
                    try:
                        # Float NaN kontrolü
                        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                            return default
                        return float(value)
                    except:
                        return default

                def safe_str(value, default=""):
                    if pd.isna(value) or value is None:
                        return default
                    return str(value)

                # Post ID to integer
                try:
                    if isinstance(post_id, (int, float)) and not pd.isna(post_id):
                        post_id = int(post_id)
                    elif isinstance(post_id, str):
                        if post_id.isdigit():
                            post_id = int(post_id)
                        else:
                            # String ID için hash kullan
                            post_id = abs(hash(post_id)) % (10 ** 10)
                    else:
                        post_id = abs(hash(str(idx))) % (10 ** 10)
                except Exception as e:
                    logger.debug(f"ID conversion failed for row {idx}, using hash: {e}")
                    post_id = abs(hash(str(row.get('shortCode', idx)))) % (10 ** 10)

                # Caption - NaN kontrolü
                caption = safe_str(row.get('caption'), "")[:2000]

                # Extract hashtags and mentions from caption
                hashtags = self._extract_hashtags(caption) if caption else []
                mentions = self._extract_mentions(caption) if caption else []

                # Images array - NaN kontrolü
                images = []
                if row.get('displayUrl') and not pd.isna(row.get('displayUrl')):
                    images.append(str(row.get('displayUrl')))

                # Tagged users - NaN kontrolü
                tagged_users = []
                if row.get('taggedUsers'):
                    if isinstance(row.get('taggedUsers'), list):
                        tagged_users = row.get('taggedUsers')
                    elif not pd.isna(row.get('taggedUsers')):
                        tagged_users = []

                # Child posts - NaN kontrolü
                child_posts = []
                if row.get('childPosts'):
                    if isinstance(row.get('childPosts'), list):
                        child_posts = row.get('childPosts')
                    elif not pd.isna(row.get('childPosts')):
                        child_posts = []

                # Comments - NaN kontrolü
                latest_comments = []
                if row.get('latestComments'):
                    if isinstance(row.get('latestComments'), list):
                        latest_comments = row.get('latestComments')[:10]
                    elif not pd.isna(row.get('latestComments')):
                        latest_comments = []

                # Music info - NaN kontrolü
                music_info = {}
                if row.get('musicInfo'):
                    if isinstance(row.get('musicInfo'), dict):
                        music_info = row.get('musicInfo')
                    elif not pd.isna(row.get('musicInfo')):
                        music_info = {}

                # Coauthor producers - NaN kontrolü
                coauthor_producers = []
                if row.get('coauthorProducers'):
                    if isinstance(row.get('coauthorProducers'), list):
                        coauthor_producers = row.get('coauthorProducers')
                    elif not pd.isna(row.get('coauthorProducers')):
                        coauthor_producers = []

                post_record = {
                    'post_id': post_id,
                    'batch_id': self.batch_id,
                    'brand_id': brand_id,
                    'sub_brand_name': sub_brand_name,
                    'short_code': safe_str(row.get('shortCode') or row.get('code')),
                    'caption': caption,
                    'post_type': post_type.lower().replace('graph', ''),
                    'product_type': safe_str(row.get('productType')),
                    'likes_count': safe_int(row.get('likesCount')),
                    'comments_count': safe_int(row.get('commentsCount')),
                    'video_view_count': safe_int(row.get('videoViewCount')),
                    'video_play_count': safe_int(row.get('videoPlayCount')),
                    'video_duration': safe_float(row.get('videoDuration')),
                    'dimensions_width': safe_int(row.get('dimensionsWidth')),
                    'dimensions_height': safe_int(row.get('dimensionsHeight')),
                    'owner_id': safe_int(row.get('ownerId')) if row.get('ownerId') else None,
                    'owner_username': safe_str(row.get('ownerUsername')),
                    'owner_full_name': safe_str(row.get('ownerFullName')),
                    'location_id': safe_int(row.get('locationId')) if row.get('locationId') else None,
                    'location_name': safe_str(row.get('locationName')),
                    'display_url': safe_str(row.get('displayUrl')),
                    'video_url': safe_str(row.get('videoUrl')) if row.get('videoUrl') else None,

                    # ✅ URL ALANLARINI EKLE:
                    'url': safe_str(row.get('url')),  # Post URL'i
                    'input_url': safe_str(row.get('inputUrl')),  # Scrape edilen profil URL'i

                    'is_sponsored': bool(row.get('isSponsored')) if not pd.isna(row.get('isSponsored')) else False,
                    'is_pinned': bool(row.get('isPinned')) if not pd.isna(row.get('isPinned')) else False,
                    'is_comments_disabled': bool(
                        row.get('commentsDisabled') or row.get('isCommentsDisabled')) if not pd.isna(
                        row.get('commentsDisabled')) else False,
                    'post_timestamp': safe_str(row.get('timestamp')),
                    'hashtags': hashtags,  # Direkt Python list
                    'mentions': mentions,  # Direkt Python list
                    'images': images,  # Direkt Python list
                    'tagged_users': tagged_users or [],  # Direkt Python list
                    'child_posts': child_posts or [],  # Direkt Python list
                    'latest_comments': latest_comments or [],  # Direkt Python list
                    'coauthor_producers': coauthor_producers or [],  # Direkt Python list
                    'music_info': music_info or {},  # Direkt Python dict
                    'hashtag_count': len(hashtags),
                    'mention_count': len(mentions),
                    'location': None,
                    'child_posts_count': len(child_posts),
                    'created_at': datetime.now().isoformat()
                }

                posts_to_insert.append(post_record)
                logger.info(f"✅ Prepared post {post_id} ({post_type}) - @{row.get('ownerUsername')}")

            except Exception as e:
                logger.error(f"Error processing post at index {idx}: {e}")
                logger.error(traceback.format_exc())
                continue

        logger.info(f"Attempting to insert {len(posts_to_insert)} posts")

        if posts_to_insert:
            try:
                # Debug: İlk post'u göster
                logger.debug(f"First post to insert: {json.dumps(posts_to_insert[0], indent=2, default=str)[:1000]}")

                response = self.supabase.schema(self.schema) \
                    .table('instagram_posts') \
                    .insert(posts_to_insert) \
                    .execute()

                logger.info(f"✅ Successfully inserted {len(posts_to_insert)} posts to instagram_posts")

                # Verify insertion
                if response.data and len(response.data) > 0:
                    first_post = response.data[0]
                    logger.info(f"   First inserted post ID: {first_post.get('post_id')}")
                    logger.info(f"   Post type: {first_post.get('post_type')}")
                    logger.info(f"   Owner: @{first_post.get('owner_username')}")

                    # Database'de kontrol et
                    verify = self.supabase.schema(self.schema) \
                        .table('instagram_posts') \
                        .select('post_id, owner_username, post_type') \
                        .eq('batch_id', self.batch_id) \
                        .limit(1) \
                        .execute()

                    if verify.data:
                        logger.info(f"✅ VERIFIED: Posts found in database!")
                    else:
                        logger.error(f"⚠️ WARNING: Posts not found in verification query")

            except Exception as e:
                logger.error(f"❌ Error inserting posts: {e}")
                logger.error(f"Full error: {traceback.format_exc()}")

                # Daha detaylı hata analizi
                if "JSON" in str(e):
                    logger.error("JSON serialization error detected. Checking for NaN values...")
                    for i, post in enumerate(posts_to_insert):
                        for key, value in post.items():
                            if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                                logger.error(f"Found NaN/Inf in post {i}, field {key}: {value}")

                # Eğer hata duplicate key ise, upsert dene
                if "duplicate key" in str(e).lower():
                    logger.info("Retrying with upsert...")
                    try:
                        for post in posts_to_insert:
                            response = self.supabase.schema(self.schema) \
                                .table('instagram_posts') \
                                .upsert(post, on_conflict='post_id,batch_id') \
                                .execute()
                        logger.info(f"✅ Successfully upserted posts")
                    except Exception as e2:
                        logger.error(f"❌ Upsert also failed: {e2}")

                if posts_to_insert:
                    logger.error(
                        f"Sample failed record: {json.dumps(posts_to_insert[0], indent=2, default=str)[:1000]}")

    def run_pipeline(self, brand_name: Optional[str] = None,
                     sub_brand_name: Optional[str] = None,
                     scrape_type: str = 'both'):
        """Pipeline'ı çalıştır"""
        logger.info(f"\n{'=' * 60}")
        logger.info(f"STARTING INSTAGRAM SCRAPING PIPELINE")
        logger.info(f"{'=' * 60}")
        logger.info(f"Brand: {brand_name or 'ALL'}")
        logger.info(f"Sub-brand: {sub_brand_name or 'ALL'}")
        logger.info(f"Type: {scrape_type}")
        logger.info(f"Batch ID: {self.batch_id}")
        logger.info(f"{'=' * 60}\n")

        # Markaları al
        brands = self.get_active_brands(brand_name)

        if not brands:
            logger.error(f"No active brands found for: {brand_name or 'ALL'}")
            return

        total_hashtags_scraped = 0
        total_profiles_scraped = 0

        for brand in brands:
            brand_id = brand['id']
            brand_name_db = brand['name']
            sub_brands = brand.get('sub_brands', {})

            # Sub-brand filtreleme
            if sub_brand_name:
                if sub_brand_name in sub_brands:
                    sub_brands = {sub_brand_name: sub_brands[sub_brand_name]}
                else:
                    logger.error(f"Sub-brand '{sub_brand_name}' not found in brand '{brand_name_db}'")
                    continue

            logger.info(f"\n📦 Processing brand: {brand_name_db}")
            logger.info(f"   Sub-brands to process: {len(sub_brands)}")

            for sub_name, config in sub_brands.items():
                logger.info(f"\n   🏷️  Sub-brand: {sub_name}")

                # HASHTAG SCRAPING
                if scrape_type in ['hashtag', 'both'] and 'hashtags' in config:
                    hashtags = config['hashtags']

                    # Test mode'da max 1 hashtag
                    if self.test_mode:
                        hashtags = hashtags[:1]  # Sadece 1 hashtag test et
                        logger.info(f"   🔍 Test mode: Limited to first hashtag")

                    logger.info(f"   🔍 Hashtags to scrape: {hashtags}")

                    for hashtag in hashtags:
                        logger.info(f"\n      #️⃣ Scraping hashtag: {hashtag}")

                        try:
                            input_data = self.prepare_hashtag_input(hashtag)
                            df = self.run_actor_and_get_results(input_data)

                            if not df.empty:
                                logger.info(f"      📊 Found {len(df)} items for {hashtag}")
                                self.normalize_and_insert_hashtag(
                                    df, brand_id, sub_name, hashtag
                                )
                                total_hashtags_scraped += 1
                            else:
                                logger.warning(f"      ⚠️ No data found for {hashtag}")

                            # Rate limiting
                            time.sleep(2)

                        except Exception as e:
                            logger.error(f"      ❌ Error scraping hashtag {hashtag}: {e}")
                            logger.error(traceback.format_exc())

                # PROFILE SCRAPING
                if scrape_type in ['profile', 'both'] and 'instagram' in config:
                    instagram_config = config['instagram']

                    # URL oluştur
                    if 'url' in instagram_config:
                        profile_url = instagram_config['url']
                    elif 'username' in instagram_config:
                        username = instagram_config['username']
                        profile_url = f"https://www.instagram.com/{username}/"
                    else:
                        logger.warning(f"   ⚠️ No Instagram URL/username found for {sub_name}")
                        continue

                    logger.info(f"\n      👤 Scraping profile: {profile_url}")

                    try:
                        input_data = self.prepare_profile_input(profile_url)
                        df = self.run_actor_and_get_results(input_data)

                        if not df.empty:
                            logger.info(f"      📊 Found {len(df)} posts from profile")
                            self.normalize_and_insert_posts(
                                df, brand_id, sub_name
                            )
                            total_profiles_scraped += 1
                        else:
                            logger.warning(f"      ⚠️ No posts found for profile")

                        # Rate limiting
                        time.sleep(2)

                    except Exception as e:
                        logger.error(f"      ❌ Error scraping profile {profile_url}: {e}")
                        logger.error(traceback.format_exc())

        # Summary
        logger.info(f"\n{'=' * 60}")
        logger.info(f"✅ PIPELINE COMPLETED")
        logger.info(f"{'=' * 60}")
        logger.info(f"📊 Summary:")
        logger.info(f"   - Batch ID: {self.batch_id}")
        logger.info(f"   - Hashtags scraped: {total_hashtags_scraped}")
        logger.info(f"   - Profiles scraped: {total_profiles_scraped}")
        logger.info(f"   - Results limit per item: {self.results_limit}")
        logger.info(f"{'=' * 60}\n")


def main():
    """Main function with argument parsing"""
    parser = argparse.ArgumentParser(
        description='Instagram Apify Scraper - Debug Version'
    )

    parser.add_argument('--test', action='store_true', help='Test mode')
    parser.add_argument('--brand', type=str, help='Brand name')
    parser.add_argument('--sub-brand', type=str, help='Sub-brand name')
    parser.add_argument('--type', type=str, choices=['hashtag', 'profile', 'both'], default='both')

    args = parser.parse_args()

    try:
        automation = InstagramApifyAutomation(test_mode=args.test)
        automation.run_pipeline(
            brand_name=args.brand,
            sub_brand_name=args.sub_brand,
            scrape_type=args.type
        )
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        logger.error(traceback.format_exc())
        raise


if __name__ == "__main__":
    main()