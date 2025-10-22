#!/usr/bin/env python
"""
Quick environment test script
Run this to verify your setup is working
"""

import sys
import os

def test_imports():
    """Test all required imports"""
    print("Testing Python imports...")
    print("-" * 50)

    tests = []

    # Test Playwright
    try:
        from playwright.async_api import async_playwright
        print("✅ Playwright (async)")
        tests.append(True)
    except Exception as e:
        print(f"❌ Playwright (async): {e}")
        tests.append(False)

    # Test Apify
    try:
        from apify_client import ApifyClient
        print("✅ Apify Client")
        tests.append(True)
    except Exception as e:
        print(f"❌ Apify Client: {e}")
        tests.append(False)

    # Test Pandas
    try:
        import pandas as pd
        print("✅ Pandas")
        tests.append(True)
    except Exception as e:
        print(f"❌ Pandas: {e}")
        tests.append(False)

    # Test dotenv
    try:
        from dotenv import load_dotenv
        print("✅ Python-dotenv")
        tests.append(True)
    except Exception as e:
        print(f"❌ Python-dotenv: {e}")
        tests.append(False)

    # Test requests
    try:
        import requests
        print("✅ Requests")
        tests.append(True)
    except Exception as e:
        print(f"❌ Requests: {e}")
        tests.append(False)

    return all(tests)

def test_env_vars():
    """Test environment variables"""
    print("\nTesting environment variables...")
    print("-" * 50)

    from dotenv import load_dotenv
    from pathlib import Path

    env_path = Path(__file__).parent / '.env'
    load_dotenv(env_path)

    required = {
        'APIFY_API_TOKEN': 'Instagram scraping',
        'TIKTOK_COOKIE': 'TikTok scraping',
        'TIKTOK_USER_AGENT': 'TikTok scraping',
    }

    tests = []
    for var, purpose in required.items():
        value = os.getenv(var)
        if value:
            # Show first 20 chars only for security
            preview = value[:20] + '...' if len(value) > 20 else value
            print(f"✅ {var}: {preview}")
            tests.append(True)
        else:
            print(f"❌ {var}: Not found")
            tests.append(False)

    return all(tests)

def test_playwright_browsers():
    """Test if Playwright browsers are installed"""
    print("\nTesting Playwright browser installation...")
    print("-" * 50)

    try:
        import subprocess
        result = subprocess.run(
            ['python', '-m', 'playwright', 'install', '--dry-run', 'chromium'],
            capture_output=True,
            text=True,
            timeout=10
        )

        if 'is already installed' in result.stdout or result.returncode == 0:
            print("✅ Chromium browser installed")
            return True
        else:
            print("❌ Chromium browser not installed")
            print("   Run: python -m playwright install chromium")
            return False
    except Exception as e:
        print(f"⚠️  Could not verify browser installation: {e}")
        return False

def test_directories():
    """Test output directories exist"""
    print("\nTesting output directories...")
    print("-" * 50)

    from pathlib import Path

    dirs = [
        Path(__file__).parent / 'outputs' / 'instagram',
        Path(__file__).parent / 'outputs' / 'tiktok',
    ]

    tests = []
    for dir_path in dirs:
        if dir_path.exists():
            print(f"✅ {dir_path.relative_to(Path(__file__).parent)}")
            tests.append(True)
        else:
            print(f"❌ {dir_path.relative_to(Path(__file__).parent)} (will be created)")
            dir_path.mkdir(parents=True, exist_ok=True)
            tests.append(True)

    return all(tests)

def main():
    print("=" * 50)
    print("Social Scrapers - Environment Test")
    print("=" * 50)
    print(f"Python: {sys.version}")
    print(f"Path: {sys.executable}")
    print()

    results = []

    # Run all tests
    results.append(("Imports", test_imports()))
    results.append(("Environment Variables", test_env_vars()))
    results.append(("Playwright Browsers", test_playwright_browsers()))
    results.append(("Output Directories", test_directories()))

    # Summary
    print("\n" + "=" * 50)
    print("Test Summary")
    print("=" * 50)

    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False

    print()
    if all_passed:
        print("✅ All tests passed! Your environment is ready.")
        print()
        print("Try running:")
        print("  python instagram/instagram_standalone.py --input 'https://www.instagram.com/nasa/' --test")
    else:
        print("❌ Some tests failed. Please fix the issues above.")
        print()
        print("Quick fixes:")
        print("  1. Install packages: pip install -r requirements.txt")
        print("  2. Install browser: python -m playwright install chromium")
        print("  3. Check .env file has all required variables")
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
