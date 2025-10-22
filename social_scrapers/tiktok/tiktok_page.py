"""
TikTok Profile Scraper - CLI Arguments Support
Kullanım:
  python tiktok_page.py  # Interaktif mod
  python tiktok_page.py --brand tuborg --sub-brands yuzdeyuzmuzik
  python tiktok_page.py --brand tuborg --sub-brands yuzdeyuzmuzik,yuzdeyuzmetal
  python tiktok_page.py --brand tuborg --sub-brands all
"""

import asyncio, json, os, re, sys, datetime as dt
import uuid
import argparse
import pandas as pd
from pathlib import Path
from typing import List, Dict, Any, Set, Optional
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from supabase import create_client, Client
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Supabase bağlantı
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

SCHEMA = "social_analytics"
TABLE = "tiktok_pages"

# Scraping ayarları
HEADLESS = True
STEP_PX = 1000
STEP_WAIT_MS = 350
MAX_IDLE_STEPS = 150
STATE_FILE = "storage_state.json"

def parse_arguments():
    """Komut satırı argümanlarını parse et"""
    parser = argparse.ArgumentParser(
        description='TikTok Page Scraper',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python tiktok_page.py                                          # Interaktif mod
  python tiktok_page.py --brand tuborg                          # Tüm sub-brand'ler
  python tiktok_page.py --brand tuborg --sub-brands yuzdeyuzmuzik
  python tiktok_page.py --brand tuborg --sub-brands yuzdeyuzmuzik,yuzdeyuzmetal
  python tiktok_page.py --brand tuborg --sub-brands all         # Açık olarak hepsi
  python tiktok_page.py --brand tuborg --batch-id abc-123       # Custom batch ID
        """
    )

    parser.add_argument(
        '--brand',
        type=str,
        default=None,
        help='Brand adı (örn: tuborg, carlsberg)'
    )

    parser.add_argument(
        '--sub-brands',
        type=str,
        default=None,
        help='Sub-brand listesi virgülle ayrılmış (örn: yuzdeyuzmuzik,yuzdeyuzmetal) veya "all" hepsi için'
    )

    parser.add_argument(
        '--batch-id',
        type=str,
        default=None,
        help='Custom batch ID (default: otomatik UUID)'
    )

    parser.add_argument(
        '--batch-counter',
        type=int,
        default=0,
        help='Batch counter değeri (default: 0)'
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Sadece nelerin scrape edileceğini göster, yazmadan'
    )

    return parser.parse_args()

def get_brand_config(brand_name="tuborg"):
    """Brands tablosundan brand config'i çeker"""
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    result = client.schema("social_analytics").table("brands")\
        .select("id, sub_brands")\
        .eq("name", brand_name)\
        .single()\
        .execute()

    if result.data:
        return result.data['id'], result.data.get('sub_brands', {})

    raise Exception(f"Brand '{brand_name}' bulunamadı!")

def get_tiktok_pages_to_scrape(brand_id, sub_brands_config):
    """Sub-brands'lerden TikTok page URL'lerini çıkarır"""
    pages_to_scrape = []

    for sub_brand_name, config in sub_brands_config.items():
        tiktok_config = config.get('tiktok', {})
        if tiktok_config and tiktok_config.get('url'):
            pages_to_scrape.append({
                'sub_brand_name': sub_brand_name,
                'url': tiktok_config['url'],
                'username': tiktok_config.get('username', ''),
                'brand_id': brand_id
            })

    return pages_to_scrape

def filter_pages_by_sub_brands(pages, sub_brands_filter):
    """Sub-brand filtresine göre page'leri filtrele"""
    if not sub_brands_filter or sub_brands_filter == ['all']:
        return pages

    filtered = []
    for page in pages:
        if page['sub_brand_name'] in sub_brands_filter:
            filtered.append(page)

    return filtered

def extract_profile_name(url: str) -> str:
    """URL'den profil ismini çıkarır"""
    try:
        if '@' in url:
            return url.split('@')[-1].split('?')[0].split('/')[0]
        else:
            parsed = urlparse(url)
            path_parts = parsed.path.strip('/').split('/')
            for part in path_parts:
                if part and not part.startswith('@'):
                    return part
            return "unknown_profile"
    except:
        return "unknown_profile"

async def _collect(resp, items: list, seen: set, done):
    """TikTok profil videolarını toplar"""
    if "/api/post/item_list" not in resp.url or resp.status != 200:
        return
    if "application/json" not in resp.headers.get("content-type", ""):
        return

    try:
        txt = re.sub(r"^\s*for\s*\(.*?\);\s*", "", await resp.text())
        data = json.loads(txt)

        video_list = data.get("itemList", [])
        print(f"    📦 API response: {len(video_list)} videos")

        for v in video_list:
            vid = v.get("id")
            if vid and vid not in seen:
                items.append(v)
                seen.add(vid)

        if not data.get("hasMore", 1):
            done.set()
            print("    🏁 No more videos available")

    except Exception as e:
        print(f"    ⚠️ Collection error: {e}")

async def _scroll(page, done):
    """Sayfayı scroll yaparak daha fazla video yükler"""
    idle, h_prev = 0, await page.evaluate("() => document.body.scrollHeight")

    while not done.is_set() and idle < MAX_IDLE_STEPS:
        await page.evaluate(f"window.scrollBy(0,{STEP_PX})")
        await page.wait_for_timeout(STEP_WAIT_MS)

        h_curr = await page.evaluate("() => document.body.scrollHeight")
        idle = idle + 1 if h_curr == h_prev else 0
        h_prev = h_curr

        if idle % 20 == 0:
            print(f"    📜 Scrolling... idle steps: {idle}/{MAX_IDLE_STEPS}")

async def scrape_profile(url: str) -> List[Dict[str, Any]]:
    """TikTok profil sayfasını scrapeleyir"""
    profile_name = extract_profile_name(url)
    print(f"🔍 Profil scraping başlıyor: @{profile_name}")
    print(f"🔗 URL: {url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=HEADLESS,
            args=["--disable-blink-features=AutomationControlled", "--mute-audio"],
        )

        ctx_kwargs = {"storage_state": STATE_FILE} if Path(STATE_FILE).exists() else {}
        ctx = await browser.new_context(**ctx_kwargs)
        page = await ctx.new_page()

        items, seen, done = [], set(), asyncio.Event()
        page.on("response", lambda r: asyncio.create_task(_collect(r, items, seen, done)))

        try:
            await page.goto(url, timeout=30000)
            await page.wait_for_timeout(3000)
            await _scroll(page, done)
            await page.wait_for_timeout(1500)

        except Exception as e:
            print(f"⚠️ Scraping error: {e}")
        finally:
            await browser.close()

    print(f"✅ @{profile_name} → {len(items)} video bulundu")
    return items

def _to_int(val):
    """String/int → int or None"""
    try:
        if val is None:
            return None
        return int(val)
    except:
        return None

def _extract_desc(v: Dict[str, Any]) -> str:
    """Video açıklamasını çıkarır"""
    c = v.get("contents")
    if isinstance(c, dict):
        return c.get("desc", "")
    if isinstance(c, list) and c and isinstance(c[0], dict):
        return c[0].get("desc", "")
    return v.get("desc", "")

def tiktok_to_row(v: Dict[str, Any], username: str) -> Dict[str, Any]:
    """TikTok video'sunu database row'una çevirir"""

    author = v.get("author", {})
    stats = v.get("stats", {})
    statsV2 = v.get("statsV2", {})
    authorStats = v.get("authorStats", {})

    # Metrikleri çıkar
    likes = _to_int(statsV2.get("diggCount") or stats.get("diggCount"))
    comments = _to_int(statsV2.get("commentCount") or stats.get("commentCount"))
    shares = _to_int(statsV2.get("shareCount") or stats.get("shareCount"))
    reposts = _to_int(statsV2.get("collectCount") or stats.get("collectCount"))
    followers = _to_int(authorStats.get("followerCount"))

    # Engagement hesapla
    total_engagement = (
        (likes or 0) +
        (comments or 0) +
        (shares or 0) +
        (reposts or 0)
    )

    engagement_rate = None
    if followers and followers > 0:
        engagement_rate = round((total_engagement / followers) * 100, 2)

    # Hashtag'leri çıkar
    hashtags = []
    challenges = v.get("challenges", [])
    for challenge in challenges:
        if challenge.get("title"):
            hashtags.append(challenge.get("title"))

    # Mentions çıkar
    mentions = []
    for text_extra in v.get("textExtra", []):
        if text_extra.get("type") == 0:  # Type 0 = mention
            mentions.append(text_extra.get("userUniqueId"))

    # Music bilgisi
    music = v.get("music", {})

    return {
        "video_id": v.get("id"),
        "profile": author.get("uniqueId") if isinstance(author, dict) else username,
        "create_time": dt.datetime.fromtimestamp(int(v["createTime"])).isoformat()
        if v.get("createTime") else None,
        "is_ad": v.get("isAd", False),

        # Author stats
        "follower_count": followers,
        "following_count": _to_int(authorStats.get("followingCount")),
        "heart_count": _to_int(authorStats.get("heart")),
        "video_count": _to_int(authorStats.get("videoCount")),

        # Video stats
        "play_count": _to_int(statsV2.get("playCount") or stats.get("playCount")),
        "like_count": likes,
        "comment_count": comments,
        "share_count": shares,
        "repost_count": reposts,

        # Content
        "description": _extract_desc(v),
        "thumbnail_url": v.get("video", {}).get("cover", ""),
        "search_query": username,  # Page için username'i kullan

        # JSONB fields
        "hashtags": hashtags if hashtags else None,
        "hashtag_count": len(hashtags),
        "mentions": mentions if mentions else None,
        "mention_count": len(mentions),

        # Music
        "music_title": music.get("title", ""),
        "music_author": music.get("authorName", ""),
        "music_original": music.get("original", False),

        # Video meta
        "video_duration": v.get("video", {}).get("duration"),
        "is_duet": bool(v.get("duetInfo")),
        "is_stitch": bool(v.get("stitchInfo")),

        # Author details
        "author_nickname": author.get("nickname") if isinstance(author, dict) else None,
        "author_verified": author.get("verified", False) if isinstance(author, dict) else False,
        "author_signature": author.get("signature", "") if isinstance(author, dict) else "",

        # Calculated
        "total_engagement": total_engagement,
        "engagement_rate": engagement_rate,
        "scraped_at": dt.datetime.now(dt.timezone.utc).isoformat()
    }

def insert_to_tiktok_profile(rows, brand_id, sub_brand_name, batch_id):
    """social_analytics.tiktok_profile tablosuna INSERT"""
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    payload = []

    for r in rows:
        if not r.get("video_id"):
            continue

        row = {
            "video_id": _to_int(r["video_id"]),
            "brand_id": brand_id,
            "sub_brand_name": sub_brand_name,
            "batch_id": batch_id,
            **r  # Diğer tüm alanları ekle
        }
        payload.append(row)

    if not payload:
        print("⚠️ Yazılacak geçerli satır yok")
        return

    # Batch halinde INSERT
    for i in range(0, len(payload), 300):
        batch = payload[i:i+300]
        try:
            result = client.schema(SCHEMA).table(TABLE).insert(batch).execute()
            print(f"✅ {len(batch)} kayıt eklendi")
        except Exception as e:
            print(f"❌ Batch insert hatası: {e}")
            print(f"Hata detayı: {str(e)}")

async def main():
    # Argümanları parse et
    args = parse_arguments()

    print("🎭 TikTok Page Scraper")
    print("─" * 50)

    # Brand belirleme
    if args.brand:
        brand_name = args.brand
        print(f"📌 Brand: {brand_name} (CLI)")
    else:
        # Interaktif mod
        brand_name = input("Brand adı (default: tuborg): ").strip() or "tuborg"
        print(f"📌 Brand: {brand_name} (Interaktif)")

    # Brand config'i al
    try:
        brand_id, sub_brands_config = get_brand_config(brand_name)
        print(f"✅ Brand ID: {brand_id}")
    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)

    # TikTok page'leri al
    all_pages = get_tiktok_pages_to_scrape(brand_id, sub_brands_config)

    if not all_pages:
        print("❌ Bu brand için TikTok page tanımlanmamış!")
        sys.exit(1)

    # Sub-brand filtresi uygula
    if args.sub_brands:
        if args.sub_brands == 'all':
            pages = all_pages
            print(f"📋 Tüm sub-brand'ler seçildi")
        else:
            sub_brands_list = args.sub_brands.split(',')
            pages = filter_pages_by_sub_brands(all_pages, sub_brands_list)
            print(f"📋 Seçili sub-brand'ler: {', '.join(sub_brands_list)}")
    else:
        # Argüman yoksa, interaktif seçim
        print(f"\n📋 Mevcut TikTok page'leri:")
        for i, page in enumerate(all_pages, 1):
            print(f"  {i}. {page['sub_brand_name']}: {page['url']}")

        choice = input("\nHangilerini scrape edelim? (sayılar virgülle, 'all' hepsi, Enter=hepsi): ").strip()

        if not choice or choice.lower() == 'all':
            pages = all_pages
        else:
            try:
                indices = [int(x.strip()) - 1 for x in choice.split(',')]
                pages = [all_pages[i] for i in indices if 0 <= i < len(all_pages)]
            except:
                print("❌ Geçersiz seçim, tümü alınıyor")
                pages = all_pages

    if not pages:
        print("❌ Scrape edilecek page bulunamadı!")
        sys.exit(1)

    # Batch ID
    batch_id = args.batch_id or str(uuid.uuid4())

    print(f"\n🔑 Batch ID: {batch_id}")
    print(f"📋 Scrape edilecek page sayısı: {len(pages)}")

    # Dry run kontrolü
    if args.dry_run:
        print("\n🔍 DRY RUN - Scrape edilecek page'ler:")
        for page in pages:
            print(f"  - {page['sub_brand_name']}: {page['url']}")
        print("\n✅ Dry run tamamlandı (veri yazılmadı)")
        return

    # Onay iste (sadece interaktif modda)
    if not args.brand:  # CLI'dan gelmediyse
        confirm = input("\nDevam edilsin mi? (y/n): ").strip().lower()
        if confirm != 'y':
            print("❌ İptal edildi")
            return

    # Scraping başlat
    total_videos = 0
    successful_pages = 0

    for page_info in pages:
        print(f"\n{'='*60}")
        print(f"🔍 Scraping: {page_info['sub_brand_name']}")
        print(f"🔗 URL: {page_info['url']}")

        try:
            videos = await scrape_profile(page_info['url'])

            if videos:
                rows = []
                for video in videos:
                    try:
                        row = tiktok_to_row(video, page_info['username'])
                        if row.get('video_id'):
                            rows.append(row)
                    except Exception as e:
                        print(f"⚠️ Video işleme hatası: {e}")
                        continue

                if rows:
                    insert_to_tiktok_profile(
                        rows,
                        brand_id=brand_id,
                        sub_brand_name=page_info['sub_brand_name'],
                        batch_id=batch_id,
                    )
                    print(f"✅ {len(rows)} video kaydedildi")
                    total_videos += len(rows)
                    successful_pages += 1
            else:
                print(f"⚠️ Video bulunamadı")

        except Exception as e:
            print(f"❌ Scraping hatası: {e}")
            import traceback
            traceback.print_exc()
            continue

    # Özet
    print(f"\n{'='*60}")
    print(f"🎉 Scraping Tamamlandı!")
    print(f"📦 Batch ID: {batch_id}")
    print(f"✅ Başarılı page: {successful_pages}/{len(pages)}")
    print(f"📊 Toplam video: {total_videos}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 İşlem durduruldu")
        sys.exit(130)
    except Exception as e:
        print(f"\n💥 Beklenmedik hata: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)