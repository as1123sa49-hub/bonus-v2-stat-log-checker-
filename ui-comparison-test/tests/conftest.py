"""pytest 配置和 fixtures"""
import os
import pytest
import pytest_asyncio
import yaml
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from config.test_config import load_config, TestConfig


# 載入測試配置
@pytest.fixture(scope="session")
def test_config() -> TestConfig:
    """載入測試配置"""
    return load_config()


# 載入測試案例
@pytest.fixture(scope="session")
def test_cases():
    """載入測試案例配置"""
    config_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config")
    test_cases_path = os.path.join(config_dir, "test_cases.yaml")
    
    with open(test_cases_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
        return data.get("test_cases", [])


# 並行瀏覽器實例（改為 session scope，整個測試會話共用）
# 注意：async fixtures 必須使用 pytest_asyncio.fixture 才能支援 session scope

@pytest_asyncio.fixture(scope="session")
async def playwright_instance():
    """Playwright 實例（整個測試會話共用）"""
    playwright = await async_playwright().start()
    yield playwright
    try:
        await playwright.stop()
    except Exception:
        pass  # 如果 playwright 連接已經關閉（例如被強制結束），忽略錯誤


@pytest_asyncio.fixture(scope="session")
async def browser_a(playwright_instance, test_config: TestConfig):
    """URL_A 的瀏覽器實例（整個測試會話共用）"""
    browser = await playwright_instance.chromium.launch(headless=False)
    yield browser
    try:
        await browser.close()
    except Exception:
        pass  # 如果 browser 已經關閉（例如被強制結束），忽略錯誤


@pytest_asyncio.fixture(scope="session")
async def page_a(browser_a: Browser, test_config: TestConfig) -> Page:
    """URL_A 的頁面實例（整個測試會話共用）"""
    context = await browser_a.new_context(
        viewport={"width": 1280, "height": 720},
        ignore_https_errors=True
    )
    page = await context.new_page()
    yield page
    try:
        await context.close()
    except Exception:
        pass  # 如果 context 已經關閉（例如被強制結束），忽略錯誤


# 注意：browser_b 和 page_b 改為在測試函數中動態創建
# 這樣可以確保第一個頁面完全載入後再開啟第二個視窗

