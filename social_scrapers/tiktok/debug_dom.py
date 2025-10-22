"""
Debug script to inspect TikTok search page DOM structure
"""
import asyncio
from playwright.async_api import async_playwright
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def debug_tiktok_dom():
    """Debug TikTok search page DOM structure"""
    query = "cat"
    search_url = f"https://www.tiktok.com/search/video?q={query}"

    logger.info(f"Opening TikTok search for: {query}")
    logger.info(f"URL: {search_url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            logger.info("Navigating to search page...")
            await page.goto(search_url, wait_until='networkidle', timeout=60000)
            logger.info("Page loaded, waiting 5 seconds for content...")
            await page.wait_for_timeout(5000)

            # Check for various possible selectors
            selectors_to_try = [
                'div[data-e2e="search_video-item"]',
                'div[data-e2e="search-item"]',
                'div.tiktok-1soki6-DivItemContainerForSearch',
                'div[class*="DivItemContainer"]',
                'div[class*="SearchResultItem"]',
                'div[class*="search"]',
                'a[href*="/@"]',
            ]

            for selector in selectors_to_try:
                try:
                    elements = await page.query_selector_all(selector)
                    logger.info(f"Selector '{selector}': Found {len(elements)} elements")
                    if len(elements) > 0:
                        # Get first element HTML
                        first_html = await elements[0].inner_html()
                        logger.info(f"  First element HTML preview: {first_html[:200]}...")
                except Exception as e:
                    logger.error(f"Error with selector '{selector}': {e}")

            # Get page HTML to inspect manually
            logger.info("\nAttempting to save page HTML...")
            html_content = await page.content()

            # Save to file
            output_file = "/tmp/tiktok_search_debug.html"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            logger.info(f"✅ Page HTML saved to: {output_file}")
            logger.info("You can open this file to inspect the structure manually")

            # Try to find video links
            links = await page.query_selector_all('a')
            video_links = []
            for link in links:
                href = await link.get_attribute('href')
                if href and '/video/' in href:
                    video_links.append(href)

            logger.info(f"\nFound {len(video_links)} video links:")
            for link in video_links[:5]:
                logger.info(f"  {link}")

        except Exception as e:
            logger.error(f"Error during debug: {e}")
        finally:
            await browser.close()

    logger.info("Debug session complete")

if __name__ == "__main__":
    asyncio.run(debug_tiktok_dom())
