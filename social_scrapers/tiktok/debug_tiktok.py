"""
Debug script to see what API endpoints TikTok is actually calling
"""
import asyncio
from playwright.async_api import async_playwright
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def debug_tiktok_search():
    """Debug TikTok search to see API endpoints"""
    query = "cat"
    search_url = f"https://www.tiktok.com/search/video?q={query}"

    logger.info(f"Opening TikTok search for: {query}")
    logger.info(f"URL: {search_url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Log ALL responses to see what's being called
        async def log_all_responses(response):
            url = response.url
            # Filter to only show API calls
            if '/api/' in url:
                logger.info(f"API CALL: {url}")
                try:
                    # Try to get response data
                    if response.status == 200:
                        logger.info(f"  Status: {response.status}")
                        # Try to peek at content type
                        content_type = response.headers.get('content-type', '')
                        logger.info(f"  Content-Type: {content_type}")

                        if 'json' in content_type.lower():
                            try:
                                data = await response.json()
                                # Log structure without full content
                                if isinstance(data, dict):
                                    logger.info(f"  Response keys: {list(data.keys())[:10]}")
                                    if 'data' in data:
                                        logger.info(f"  Has 'data' key, type: {type(data['data'])}")
                                        if isinstance(data['data'], list) and len(data['data']) > 0:
                                            logger.info(f"  First data item keys: {list(data['data'][0].keys())[:10]}")
                            except Exception as e:
                                logger.info(f"  Could not parse JSON: {e}")
                except Exception as e:
                    logger.error(f"  Error inspecting response: {e}")

        page.on('response', log_all_responses)

        try:
            logger.info("Navigating to search page...")
            await page.goto(search_url, wait_until='networkidle', timeout=60000)
            logger.info("Page loaded, waiting 5 seconds...")
            await page.wait_for_timeout(5000)

            logger.info("Scrolling...")
            for i in range(3):
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await page.wait_for_timeout(2000)
                logger.info(f"Scrolled {i+1} times")

            logger.info("Done scrolling, waiting 2 more seconds...")
            await page.wait_for_timeout(2000)

        except Exception as e:
            logger.error(f"Error during debug: {e}")
        finally:
            await browser.close()

    logger.info("Debug session complete")

if __name__ == "__main__":
    asyncio.run(debug_tiktok_search())
