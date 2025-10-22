"""
Test TikTok scraping with anti-detection measures
"""
import asyncio
import os
from playwright.async_api import async_playwright
from pathlib import Path
from dotenv import load_dotenv
import logging

# Load environment
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_stealth_scraping():
    """Test TikTok scraping with anti-detection"""
    query = "cat"
    search_url = f"https://www.tiktok.com/search/video?q={query}"

    cookie = os.getenv("TIKTOK_COOKIE")
    user_agent = os.getenv("TIKTOK_USER_AGENT")

    logger.info("Starting stealth scraping test...")

    async with async_playwright() as p:
        # Launch with anti-detection args
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ]
        )

        # Create context with cookies
        context = await browser.new_context(
            user_agent=user_agent,
            viewport={'width': 1680, 'height': 1050},
            locale='en-US',
        )

        # Add cookies
        cookies_list = []
        for cookie_str in cookie.split('; '):
            if '=' in cookie_str:
                name, value = cookie_str.split('=', 1)
                cookies_list.append({
                    'name': name,
                    'value': value,
                    'domain': '.tiktok.com',
                    'path': '/'
                })

        await context.add_cookies(cookies_list)

        # Create page
        page = await context.new_page()

        # Add script to hide automation
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            window.navigator.chrome = {
                runtime: {},
            };

            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        """)

        try:
            logger.info(f"Navigating to: {search_url}")
            await page.goto(search_url, wait_until='networkidle', timeout=60000)
            logger.info("Page loaded, waiting for content...")
            await page.wait_for_timeout(5000)

            # Try different selectors
            selectors = [
                'div[data-e2e="search_video-item"]',
                'div[data-e2e="search_video-item-wrapper"]',
                'div[class*="DivItemContainer"]',
                'a[href*="/video/"]',
            ]

            for selector in selectors:
                elements = await page.query_selector_all(selector)
                logger.info(f"Selector '{selector}': {len(elements)} elements")

            # Count video links
            all_links = await page.query_selector_all('a')
            video_links = []
            for link in all_links:
                href = await link.get_attribute('href')
                if href and '/video/' in href:
                    video_links.append(href)

            logger.info(f"\n✅ Found {len(video_links)} video links")

            if len(video_links) > 0:
                logger.info("Sample video links:")
                for link in video_links[:5]:
                    logger.info(f"  {link}")
            else:
                logger.warning("No videos found! Saving HTML for inspection...")
                html = await page.content()
                with open('/tmp/tiktok_stealth_test.html', 'w', encoding='utf-8') as f:
                    f.write(html)
                logger.info("HTML saved to /tmp/tiktok_stealth_test.html")

        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            await browser.close()

    logger.info("Test complete")

if __name__ == "__main__":
    asyncio.run(test_stealth_scraping())
