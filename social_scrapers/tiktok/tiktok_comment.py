"""
TikTok Comment Scraper - Yeni Şema (social_analytics)
"""

import os, time, json, random, sys
from pathlib import Path
from urllib.parse import urlencode
from datetime import datetime, timezone
from typing import Iterable, List, Dict, Any, Optional
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from dotenv import load_dotenv
from supabase import create_client, Client
import argparse
import uuid

# .env yükleme
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

# TikTok API config
UA = os.getenv("TIKTOK_USER_AGENT", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
COOKIE = os.getenv("TIKTOK_COOKIE")
BASE_QS = os.getenv("TIKTOK_COMMENTS_BASEQS")

# Debug
print(f"🔍 TikTok Config:")
print(f"  - User Agent: {'✅' if UA else '❌'}")
print(f"  - Cookie: {'✅' if COOKIE else '❌'} ({len(COOKIE) if COOKIE else 0} karakter)")
print(f"  - Base QS: {'✅' if BASE_QS else '❌'} ({len(BASE_QS) if BASE_QS else 0} karakter)")

SCHEMA = "social_analytics"

# Kritik kontroller
if not (SUPABASE_URL and SUPABASE_KEY):
    raise SystemExit("❌ ENV eksik: SUPABASE_URL/KEY")

if not COOKIE:
    raise SystemExit("❌ TIKTOK_COOKIE eksik! .env dosyasını kontrol edin")

if not BASE_QS:
    raise SystemExit("❌ TIKTOK_COMMENTS_BASEQS eksik! .env dosyasını kontrol edin")

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def tbl(name: str):
    """social_analytics şemasındaki tabloya erişim."""
    return sb.schema(SCHEMA).table(name)

# HTTP Session
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.tiktok.com/",
    "Cookie": COOKIE,
})
API_BASE = "https://www.tiktok.com/api/comment/list/"

class TikTokHTTPError(Exception): pass
class TikTokJSONError(Exception): pass

def _parse_base_qs(base_qs: str) -> Dict[str, str]:
    """Query string'i parse et"""
    if not base_qs:
        return {}
    pairs = []
    for chunk in base_qs.split("&"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            pairs.append((k, v))
    return dict(pairs)

def _safe_json(resp: requests.Response) -> Dict[str, Any]:
    """Response'dan güvenli JSON çıkar"""
    ct = resp.headers.get("Content-Type", "").lower()
    text = resp.text or ""

    # Debug için daha detaylı loglama
    if resp.status_code == 200:
        if not text:
            print(f"    ⚠️ Boş response, Cookie expire olmuş olabilir!")
            raise TikTokJSONError("Empty response - Cookie may be expired")

        if "application/json" in ct:
            try:
                return resp.json()
            except json.JSONDecodeError as e:
                print(f"    ⚠️ JSON parse hatası. Response başlangıcı: {text[:100]}")
                raise TikTokJSONError(f"JSON decode error: {e}")
        else:
            print(f"    ⚠️ JSON değil, Content-Type: {ct}")
            raise TikTokJSONError(f"Not JSON response: {ct}")

    if resp.status_code in (429, 502, 503, 520, 521, 522):
        raise TikTokHTTPError(f"HTTP {resp.status_code}")

    raise TikTokHTTPError(f"HTTP {resp.status_code}: {text[:200]}")

@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=16),
    retry=retry_if_exception_type((requests.RequestException, TikTokHTTPError, TikTokJSONError)),
)
def fetch_page(video_id: str, cursor: int = 0, count: int = 20) -> dict:
    """TikTok API'den comment sayfası çek"""
    params = _parse_base_qs(BASE_QS)
    params["aweme_id"] = str(video_id)
    params["cursor"] = str(cursor)
    params.setdefault("count", str(count))

    url = f"{API_BASE}?{urlencode(params)}"

    try:
        resp = SESSION.get(url, timeout=30)

        # DEBUG: Response durumunu göster
        print(f"    🔍 API Response: Status={resp.status_code}, Size={len(resp.text)}")

        data = _safe_json(resp)

        # DEBUG: Gelen veriyi kontrol et
        if "comments" in data:
            print(f"    📊 Gelen yorum sayısı: {len(data.get('comments', []))}")

        if data.get("status_code") not in (0, None):
            print(f"    ⚠️ TikTok status_code: {data.get('status_code')}, msg: {data.get('status_msg')}")

        return data
    except Exception as e:
        print(f"    ❌ API hatası: {e}")
        return {"comments": [], "has_more": 0}

def to_utc(ts):
    """Timestamp'i UTC datetime'a çevir"""
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except Exception:
        return None


def upsert_commenters(users: list[dict], batch_id: str = None):
    """Commenter bilgilerini güncelle"""
    if not users:
        return

    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for u in users:
        avatar = None
        at = u.get("avatar_thumb") or {}
        if isinstance(at, dict):
            avatar = (at.get("url_list") or [None])[0]

        row_data = {
            "uid": u.get("uid"),
            "sec_uid": u.get("sec_uid"),
            "unique_id": u.get("unique_id"),
            "nickname": u.get("nickname"),
            "avatar": avatar,
            "verified": u.get("verified", False),
            "updated_at": now_iso,
        }

        # batch_id varsa ekle
        if batch_id:
            row_data["batch_id"] = batch_id

        rows.append(row_data)

    if rows:
        try:
            tbl("tiktok_commenters").upsert(rows, on_conflict="uid").execute()
        except Exception as e:
            print(f"    ⚠️ Commenters upsert hatası: {e}")

def insert_comments(video_id: str, comments: list[dict], brand_id: int,
                   sub_brand_name: str, batch_id: str):
    """Yorumları social_analytics.tiktok_comments'e ekle"""
    if not comments:
        return

    rows, users = [], []
    now_iso = datetime.now(timezone.utc).isoformat()

    for c in comments:
        u = c.get("user") or {}
        users.append(u)

        created_dt = to_utc(c.get("create_time"))
        created_iso = created_dt.isoformat() if created_dt else None

        # Parent comment kontrolü
        parent_cid = None
        if c.get("reply_id") and c.get("reply_id") != "0":
            parent_cid = c.get("reply_id")

        # Avatar URL'yi çıkar
        avatar_url = None
        if isinstance(u.get("avatar_thumb"), dict):
            url_list = u.get("avatar_thumb", {}).get("url_list", [])
            if url_list and len(url_list) > 0:
                avatar_url = url_list[0]

        rows.append({
            "comment_id": str(c.get("cid")),
            "video_id": str(video_id),
            "brand_id": brand_id,
            "sub_brand_name": sub_brand_name,
            "batch_id": batch_id,  # UUID string olarak gönderilir
            "parent_comment_id": parent_cid,
            "user_uid": u.get("uid"),
            "user_unique_id": u.get("unique_id"),
            "user_nickname": u.get("nickname"),
            "user_verified": u.get("verified", False),
            "user_avatar": avatar_url,
            "text": c.get("text"),
            "language": c.get("comment_language"),
            "like_count": c.get("digg_count", 0),
            "reply_count": c.get("reply_comment_total", 0),
            "is_author_liked": bool(c.get("is_author_digged")),
            "status": c.get("status"),
            "created_at_utc": created_iso,
            "deleted": False,
            "raw_json": c,
            "scraped_at": now_iso,
        })

    # Commenters'ı güncelle (batch_id ekle)
    upsert_commenters(users, batch_id)  # batch_id parametresi ekle

    # Comments'leri ekle
    if rows:
        try:
            # Batch halinde insert
            for i in range(0, len(rows), 500):
                batch = rows[i:i+500]
                tbl("tiktok_comments").insert(batch).execute()
            print(f"    ✅ {len(rows)} yorum eklendi")
        except Exception as e:
            print(f"    ❌ Comments insert hatası: {e}")

def save_crawl_state(video_id: str, brand_id: int, sub_brand_name: str,
                     cursor: int, has_more: bool, total_fetched: int, batch_id: str):
    """Crawl durumunu kaydet"""
    try:
        tbl("tiktok_comment_crawl_state").upsert({
            "video_id": str(video_id),
            "brand_id": brand_id,
            "sub_brand_name": sub_brand_name,
            "batch_id": batch_id,  # UUID string olarak
            "last_cursor": cursor,
            "has_more": has_more,
            "total_comments_fetched": total_fetched,
            "last_checked_at": datetime.now(timezone.utc).isoformat()
        }, on_conflict="video_id").execute()
    except Exception as e:
        print(f"    ⚠️ Crawl state kayıt hatası: {e}")

def scrape_comments_for_video(video_id: str, brand_id: int, sub_brand_name: str,
                              batch_id: str, max_pages: int = 5):
    """Bir video için yorumları scrape et"""
    cursor, page, total_fetched = 0, 0, 0

    print(f"  📝 Video {video_id} yorumları çekiliyor...")

    while True:
        try:
            data = fetch_page(video_id, cursor=cursor, count=20)
            comments = data.get("comments") or []

            if comments:
                insert_comments(video_id, comments, brand_id, sub_brand_name, batch_id)
                total_fetched += len(comments)

            has_more = bool(int(data.get("has_more", 0)) == 1)
            next_cursor = int(data.get("cursor", 0))
            page += 1

            # Rate limiting
            time.sleep(0.7 + random.uniform(0.0, 0.3))

            # State kaydet - batch_id eklendi!
            save_crawl_state(video_id, brand_id, sub_brand_name,
                           next_cursor, has_more, total_fetched, batch_id)

            # Devam etme kontrolü
            if page >= max_pages or not has_more:
                break

            cursor = next_cursor

        except Exception as e:
            print(f"    ⚠️ Hata: {e}")
            break

    if total_fetched > 0:
        print(f"    ✅ {total_fetched} yorum toplandı ({page} sayfa)")
    else:
        print(f"    ℹ️ Yorum yok veya çekilemedi")

    return total_fetched

def scrape_comments_for_batch(batch_id: str, brand_id: int,
                              sub_brand_name: Optional[str] = None,
                              source_table: str = "both",
                              max_videos: Optional[int] = None,
                              max_pages_per_video: int = 5):
    """Belirli bir batch'teki videolar için yorumları scrape et"""
    video_ids = set()

    # Hangi tablolardan video çekeceğiz - DÜZELTİLDİ!
    tables = []
    if source_table in ["pages", "both"]:
        tables.append("tiktok_pages")  # ✅ Doğru tablo ismi
    if source_table in ["queries", "both"]:
        tables.append("tiktok_queries")

    # Video ID'leri topla
    for table in tables:
        try:
            q = tbl(table).select("video_id, sub_brand_name, comment_count")\
                .eq("batch_id", batch_id)\
                .eq("brand_id", brand_id)

            if sub_brand_name:
                q = q.eq("sub_brand_name", sub_brand_name)

            result = q.execute()

            print(f"📊 {table} tablosundan {len(result.data)} video bulundu")

            for row in result.data or []:
                vid = row.get("video_id")
                sub = row.get("sub_brand_name")
                comment_count = row.get("comment_count", 0)
                if vid:
                    video_ids.add((str(vid), sub, comment_count))

        except Exception as e:
            print(f"⚠️ {table} okuma hatası: {e}")

    if not video_ids:
        print("❌ Hiç video bulunamadı!")
        return

    # Comment count'a göre sırala (çok olanlar önce)
    video_list = sorted(list(video_ids), key=lambda x: x[2], reverse=True)

    if max_videos:
        video_list = video_list[:max_videos]

    print(f"\n🎯 {len(video_list)} video için yorum scraping başlıyor...")
    print(f"📦 Batch ID: {batch_id}")
    print(f"🏷️ Brand ID: {brand_id}")
    if sub_brand_name:
        print(f"📌 Sub Brand: {sub_brand_name}")

    # İstatistikler
    videos_with_comments = [v for v in video_list if v[2] > 0]
    print(f"📊 Yorumu olan video sayısı: {len(videos_with_comments)}")

    total_comments = 0
    successful_videos = 0

    for i, (video_id, sub_brand, expected_comments) in enumerate(video_list, 1):
        print(f"\n[{i}/{len(video_list)}] Video: {video_id} (sub: {sub_brand}, beklenen: {expected_comments} yorum)")

        count = scrape_comments_for_video(
            video_id=video_id,
            brand_id=brand_id,
            sub_brand_name=sub_brand,
            batch_id=batch_id,
            max_pages=max_pages_per_video
        )

        if count > 0:
            successful_videos += 1
        total_comments += count

        # Rate limiting between videos
        if i < len(video_list):
            time.sleep(1 + random.uniform(0, 0.5))

    print(f"\n✅ Scraping Tamamlandı!")
    print(f"📊 Toplam {total_comments} yorum toplandı")
    print(f"✅ {successful_videos}/{len(video_list)} video'dan yorum alındı")

    return total_comments

def main():
    """CLI interface"""
    parser = argparse.ArgumentParser(description="TikTok Comment Scraper")
    parser.add_argument("--batch-id", required=True, help="Batch ID")
    parser.add_argument("--brand-id", type=int, required=True, help="Brand ID")
    parser.add_argument("--sub-brand", help="Sub-brand name (opsiyonel)")
    parser.add_argument("--source", choices=["pages", "queries", "both"],
                       default="both", help="Hangi tablodan video alınacak")
    parser.add_argument("--max-videos", type=int, help="Max video sayısı")
    parser.add_argument("--max-pages", type=int, default=5,
                       help="Her video için max sayfa")

    args = parser.parse_args()

    scrape_comments_for_batch(
        batch_id=args.batch_id,
        brand_id=args.brand_id,
        sub_brand_name=args.sub_brand,
        source_table=args.source,
        max_videos=args.max_videos,
        max_pages_per_video=args.max_pages
    )

if __name__ == "__main__":
    main()