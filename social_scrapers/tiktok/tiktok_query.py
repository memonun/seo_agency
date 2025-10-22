"""
TikTok Query Scraper - CLI Arguments Support
Kullanım:
  python tiktok_query.py  # Interaktif mod
  python tiktok_query.py --brand tuborg --sub-brands yuzdeyuzmuzik
  python tiktok_query.py --brand tuborg --sub-brands yuzdeyuzmuzik,yuzdeyuzmetal
  python tiktok_query.py --brand tuborg --sub-brands all --max-videos 100
"""

import os, time, json, re, uuid, sys
import argparse
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import quote, urlparse, parse_qs, unquote
from playwright.sync_api import sync_playwright
from supabase import create_client, Client
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import logging
import csv

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Logging ayarları
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Supabase credentials
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

SCHEMA = "social_analytics"
TABLE = "tiktok_queries"

def parse_arguments():
    """Komut satırı argümanlarını parse et"""
    parser = argparse.ArgumentParser(
        description='TikTok Query Scraper',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python tiktok_query.py                                          # Interaktif mod
  python tiktok_query.py --brand tuborg                          # Tüm query'ler
  python tiktok_query.py --brand tuborg --sub-brands yuzdeyuzmuzik
  python tiktok_query.py --brand tuborg --sub-brands yuzdeyuzmuzik,yuzdeyuzmetal
  python tiktok_query.py --brand tuborg --sub-brands all --max-videos 100
  python tiktok_query.py --brand tuborg --batch-id abc-123       # Custom batch ID
        """
    )

    parser.add_argument('--brand', type=str, default=None, help='Brand adı')
    parser.add_argument('--sub-brands', type=str, default=None, help='Sub-brand listesi')
    parser.add_argument('--batch-id', type=str, default=None, help='Custom batch ID')
    parser.add_argument('--max-videos', type=int, default=200, help='Maximum video sayısı')
    parser.add_argument('--dry-run', action='store_true', help='Test modu')
    parser.add_argument('--no-cleanup', action='store_true', help='Eski query\'leri temizleme')

    return parser.parse_args()

# Global helper fonksiyonlar (class dışında)
def calculate_engagement(likes, comments, shares, reposts):
    """Standart engagement hesaplama"""
    return (
        (likes or 0) +
        (comments or 0) +
        (shares or 0) +
        (reposts or 0)
    )

def calculate_engagement_rate(engagement, followers):
    """Engagement rate hesaplama"""
    if followers and followers > 0:
        return round((engagement / followers) * 100, 2)
    return 0

class TikTokQueryScraper:
    def __init__(self, brand_name="tuborg", batch_id=None):
        """Initialize Supabase client and configs"""
        try:
            self.supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            logger.info("✅ Supabase bağlantısı başarılı")
        except Exception as e:
            logger.error(f"❌ Supabase bağlantı hatası: {e}")
            raise

        self.videos_data = []
        self.processed_ids = set()

        # Brand config'i al
        self.brand_id, self.sub_brands_config = self.get_brand_config(brand_name)

        # Batch ID
        self.batch_id = batch_id or str(uuid.uuid4())

        # Batch counter'ı al
        self.batch_counter = self.get_next_batch_counter()

        print(f"🔑 Batch ID: {self.batch_id}")
        print(f"📊 Batch Counter: {self.batch_counter}")

    def get_brand_config(self, brand_name):
        """Brands tablosundan config çek"""
        result = self.supabase.schema("social_analytics").table("brands")\
            .select("id, sub_brands")\
            .eq("name", brand_name)\
            .single()\
            .execute()

        if result.data:
            return result.data['id'], result.data.get('sub_brands', {})
        raise Exception(f"Brand '{brand_name}' bulunamadı!")

    def get_next_batch_counter(self):
        """Mevcut max batch_counter'ı al ve 1 ekle"""
        result = self.supabase.schema(SCHEMA).table(TABLE)\
            .select("batch_counter")\
            .order("batch_counter", desc=True)\
            .limit(1)\
            .execute()

        if result.data and result.data[0].get('batch_counter') is not None:
            return result.data[0]['batch_counter'] + 1
        return 1

    def get_queries_to_scrape(self, sub_brands_filter=None):
        """Sub-brands'lerden TikTok query'lerini çıkar"""
        queries = []

        for sub_brand_name, config in self.sub_brands_config.items():
            # Filter uygula
            if sub_brands_filter and sub_brand_name not in sub_brands_filter:
                continue

            tiktok_query = config.get('tiktok_query')
            if tiktok_query:
                queries.append({
                    'sub_brand_name': sub_brand_name,
                    'query': tiktok_query,
                    'brand_id': self.brand_id
                })

        return queries

    def build_search_url(self, query):
        """Query'den TikTok search URL'i oluştur"""
        encoded_query = quote(query)
        return f"https://www.tiktok.com/search?q={encoded_query}"

    def extract_query_from_url(self, url: str) -> str:
        """URL'den search query'yi çıkar"""
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            query = params.get('q', [''])[0]
            return unquote(query)
        except:
            return ""

    def scrape_search_url(self, search_url: str, query: str, max_videos: int = 200) -> List[Dict[str, Any]]:
        """TikTok search URL'ini scrape eder"""

        print(f"\n🔍 URL scraping başlıyor: {search_url}")
        self.videos_data = []  # Her scrape'de resetle
        self.processed_ids = set()

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

            # API çağrılarını yakalamak için listener
            api_responses = []

            def handle_response(response):
                if 'api/search/general/full' in response.url or \
                   'api/post/item_list' in response.url or \
                   'api/search/general/preview' in response.url:
                    try:
                        data = response.json()
                        api_responses.append(data)
                        print(f"    📡 API yakalandı: {response.url[:50]}...")
                    except Exception as e:
                        print(f"    ⚠️ Response parse hatası: {e}")

            page.on("response", handle_response)

            # Sayfaya git - networkidle yerine domcontentloaded kullan
            try:
                page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                time.sleep(3)

                # Scroll yaparak daha fazla video yükle
                for i in range(5):
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    time.sleep(2)

                    # API response'larını işle
                    for response_data in api_responses:
                        self._process_api_response(response_data, query)

                    if len(self.videos_data) >= max_videos:
                        break

            except Exception as e:
                print(f"❌ Sayfa yükleme hatası: {e}")

            browser.close()

        print(f"✅ {len(self.videos_data)} video bulundu")
        return self.videos_data[:max_videos]

    def _process_api_response(self, data: dict, query: str):
        """API yanıtını işle ve video verilerini çıkar"""
        videos_found = []

        try:
            # data.data içindeki section'ları kontrol et
            if 'data' in data and isinstance(data['data'], list):
                for section in data['data']:
                    if isinstance(section, dict):
                        # Type 1: Video item'ları
                        if section.get('type') == 1 and 'item' in section:
                            item = section['item']
                            if item and item.get('id') not in self.processed_ids:
                                videos_found.append(item)
                                self.processed_ids.add(item['id'])

            # itemList formatı
            if 'itemList' in data and isinstance(data['itemList'], list):
                for item in data['itemList']:
                    if item and item.get('id') not in self.processed_ids:
                        videos_found.append(item)
                        self.processed_ids.add(item['id'])

            # Video verilerini işle
            for item in videos_found:
                video_data = self._extract_video_data(item, query)
                if video_data:
                    self.videos_data.append(video_data)

            has_more = data.get('has_more', data.get('hasMore', False))
            print(f"  📦 API response: {len(videos_found)} items, has_more: {has_more}")

        except Exception as e:
            print(f"  ❌ API response işleme hatası: {e}")

    def _extract_video_data(self, item: dict, query: str) -> Optional[Dict[str, Any]]:
        """Video item'ından veri çıkar"""
        try:
            # Author bilgileri
            author = item.get('author', {})
            author_stats = item.get('authorStats', {})

            # Video bilgileri
            video = item.get('video', {})
            stats = item.get('stats', {})

            # Metrikleri al
            likes = stats.get('diggCount', 0)
            comments = stats.get('commentCount', 0)
            shares = stats.get('shareCount', 0)
            reposts = stats.get('repostCount', 0)
            followers = author_stats.get('followerCount', 0)

            # Engagement hesapla (global fonksiyonları kullan)
            total_engagement = calculate_engagement(likes, comments, shares, reposts)
            engagement_rate = calculate_engagement_rate(total_engagement, followers)

            # Hashtag'leri çıkar
            desc = item.get('desc', '')
            hashtags = []
            challenges = item.get('challenges', [])
            for challenge in challenges:
                if challenge.get('title'):
                    hashtags.append(challenge.get('title'))

            # Mention'ları çıkar
            mentions = []
            for text_extra in item.get('textExtra', []):
                if text_extra.get('type') == 0:
                    mentions.append(text_extra.get('userUniqueId'))

            # Music bilgileri
            music = item.get('music', {})

            return {
                'video_id': item.get('id'),
                'profile': author.get('uniqueId', ''),
                'create_time': datetime.fromtimestamp(item.get('createTime', 0)).isoformat()
                    if item.get('createTime') else None,
                'is_ad': item.get('isAd', False),

                # Author stats
                'follower_count': followers,
                'following_count': author_stats.get('followingCount', 0),
                'heart_count': author_stats.get('heartCount', 0),
                'video_count': author_stats.get('videoCount', 0),

                # Video stats
                'play_count': stats.get('playCount', 0),
                'like_count': likes,
                'comment_count': comments,
                'share_count': shares,
                'repost_count': reposts,

                'total_engagement': total_engagement,
                'engagement_rate': engagement_rate,

                # Content details
                'description': desc,
                'thumbnail_url': video.get('cover', ''),
                'search_query': query,

                # JSONB fields
                'hashtags': hashtags if hashtags else None,
                'hashtag_count': len(hashtags),
                'mentions': mentions if mentions else None,
                'mention_count': len(mentions),

                # Music
                'music_title': music.get('title', None),
                'music_author': music.get('authorName', None),
                'music_original': music.get('original', False),

                # Video properties
                'video_duration': video.get('duration', 0),
                'is_duet': item.get('duetEnabled', False),
                'is_stitch': item.get('stitchEnabled', False),

                # Author details
                'author_nickname': author.get('nickname', None),
                'author_verified': author.get('verified', False),
                'author_signature': author.get('signature', None),

                'scraped_at': datetime.now(timezone.utc).isoformat()
            }
        except Exception as e:
            print(f"  ⚠️ Video veri çıkarma hatası: {e}")
            return None

    def save_to_supabase(self, videos: List[Dict[str, Any]], sub_brand_name: str) -> bool:
        """Videoları Supabase'e kaydet"""
        if not videos:
            print("⚠️ Kaydedilecek video yok")
            return False

        try:
            # Her video için gerekli alanları ekle
            for video in videos:
                video['brand_id'] = self.brand_id
                video['sub_brand_name'] = sub_brand_name
                video['batch_id'] = self.batch_id
                video['batch_counter'] = self.batch_counter

            # UPSERT kullan - eğer aynı video_id + batch_id varsa güncelle
            response = self.supabase.schema(SCHEMA).table(TABLE).upsert(
                videos,
                on_conflict='video_id,batch_id',  # PK constraint'e göre
                ignore_duplicates=False  # Güncelle, ignore etme
            ).execute()

            print(f"✅ {len(videos)} video Supabase'e kaydedildi/güncellendi")
            return True

        except Exception as e:
            print(f"❌ Supabase kayıt hatası: {e}")

            # Yedek CSV
            backup_filename = f"backup_tiktok_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            self.save_to_csv(videos, backup_filename)
            print(f"💾 Veriler yedek olarak {backup_filename} dosyasına kaydedildi")
            return False
    def save_to_csv(self, videos: List[Dict[str, Any]], filename: str):
        """Videoları CSV dosyasına kaydet (yedek)"""
        if not videos:
            return

        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = videos[0].keys()
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(videos)

    def cleanup_old_queries(self):
        """4 batch'ten eski query'leri sil"""
        try:
            cutoff_counter = self.batch_counter - 4

            if cutoff_counter > 0:
                result = self.supabase.schema(SCHEMA).table(TABLE)\
                    .delete()\
                    .lt('batch_counter', cutoff_counter)\
                    .execute()

                print(f"🧹 Eski query'ler temizlendi (batch_counter < {cutoff_counter})")
        except Exception as e:
            print(f"⚠️ Cleanup hatası: {e}")

def main():
    # Argümanları parse et
    args = parse_arguments()

    print("🎭 TikTok Query Scraper")
    print("─" * 50)

    # Brand belirleme
    if args.brand:
        brand_name = args.brand
        print(f"📌 Brand: {brand_name} (CLI)")
    else:
        # Interaktif mod
        brand_name = input("Brand adı (default: tuborg): ").strip() or "tuborg"
        print(f"📌 Brand: {brand_name} (Interaktif)")

    try:
        # Scraper'ı başlat
        scraper = TikTokQueryScraper(brand_name, args.batch_id)

        # Query'leri al
        all_queries = scraper.get_queries_to_scrape()

        if not all_queries:
            print("❌ Bu brand için TikTok query tanımlanmamış!")
            sys.exit(1)

        # Sub-brand filtresi uygula
        if args.sub_brands:
            if args.sub_brands == 'all':
                queries = all_queries
                print(f"📋 Tüm query'ler seçildi")
            else:
                sub_brands_list = args.sub_brands.split(',')
                queries = scraper.get_queries_to_scrape(sub_brands_list)
                print(f"📋 Seçili sub-brand'ler: {', '.join(sub_brands_list)}")
        else:
            # Interaktif seçim
            print(f"\n📋 Mevcut TikTok query'leri:")
            for i, query_info in enumerate(all_queries, 1):
                print(f"  {i}. {query_info['sub_brand_name']}: '{query_info['query']}'")

            choice = input("\nHangilerini scrape edelim? (sayılar virgülle, 'all' hepsi, Enter=hepsi): ").strip()

            if not choice or choice.lower() == 'all':
                queries = all_queries
            else:
                try:
                    indices = [int(x.strip()) - 1 for x in choice.split(',')]
                    queries = [all_queries[i] for i in indices if 0 <= i < len(all_queries)]
                except:
                    print("❌ Geçersiz seçim, tümü alınıyor")
                    queries = all_queries

        if not queries:
            print("❌ Scrape edilecek query bulunamadı!")
            sys.exit(1)

        print(f"\n📋 Scrape edilecek query sayısı: {len(queries)}")
        print(f"🎯 Max video/query: {args.max_videos}")

        # Dry run kontrolü
        if args.dry_run:
            print("\n🔍 DRY RUN - Scrape edilecek query'ler:")
            for query_info in queries:
                print(f"  - {query_info['sub_brand_name']}: '{query_info['query']}'")
            print("\n✅ Dry run tamamlandı (veri yazılmadı)")
            return

        # Onay iste (sadece interaktif modda)
        if not args.brand:
            confirm = input("\nDevam edilsin mi? (y/n): ").strip().lower()
            if confirm != 'y':
                print("❌ İptal edildi")
                return

        # Scraping başlat
        total_videos = 0
        successful_queries = 0

        for query_info in queries:
            print(f"\n{'='*60}")
            print(f"🔍 Scraping query: '{query_info['query']}'")
            print(f"📦 Sub-brand: {query_info['sub_brand_name']}")

            # Search URL oluştur
            search_url = scraper.build_search_url(query_info['query'])

            try:
                # Scraping yap
                videos = scraper.scrape_search_url(
                    search_url,
                    query_info['query'],
                    max_videos=args.max_videos
                )

                if videos:
                    success = scraper.save_to_supabase(videos, query_info['sub_brand_name'])
                    if success:
                        print(f"✅ {len(videos)} video kaydedildi")
                        total_videos += len(videos)
                        successful_queries += 1
                else:
                    print(f"⚠️ Video bulunamadı")

            except Exception as e:
                print(f"❌ Scraping hatası: {e}")
                import traceback
                traceback.print_exc()
                continue

        # Cleanup
        if not args.no_cleanup:
            scraper.cleanup_old_queries()

        # Özet
        print(f"\n{'='*60}")
        print(f"🎉 Scraping Tamamlandı!")
        print(f"📦 Batch ID: {scraper.batch_id}")
        print(f"📊 Batch Counter: {scraper.batch_counter}")
        print(f"✅ Başarılı query: {successful_queries}/{len(queries)}")
        print(f"📊 Toplam video: {total_videos}")

    except Exception as e:
        print(f"\n❌ Hata: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()