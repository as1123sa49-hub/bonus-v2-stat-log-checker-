"""UI 比對測試套件"""
import os
import asyncio
import pytest
from typing import Dict, Any
from playwright.async_api import Page, Browser, BrowserContext
from config.test_config import TestConfig
from src.comparison.screenshot_engine import ScreenshotEngine
from src.comparison.diff_engine import DiffEngine
from src.actions.test_actions import execute_action
from src.api.websocket_monitor import WebSocketMonitor
from src.api.http_monitor import HTTPMonitor
from src.utils.report_generator import ReportGenerator
from src.utils.logger import logger


@pytest.mark.ui_comparison
@pytest.mark.asyncio
async def test_ui_comparison(
    page_a: Page,
    playwright_instance,
    test_config: TestConfig,
    test_cases: list
):
    """
    執行 UI 比對測試
    
    Args:
        page_a: URL_A 的頁面實例
        playwright_instance: Playwright 實例（用於創建第二個瀏覽器）
        test_config: 測試配置
        test_cases: 測試案例列表
    """
    # 先載入第一個頁面（啟動背景任務，不等待完成）
    print("\n[測試開始] 啟動 URL_A 導航...", flush=True)
    logger.info("啟動 URL_A 導航...")
    
    # 創建 URL_A 導航任務，但不等待完成
    print("[執行] 啟動 page_a.goto() 背景任務...", flush=True)
    
    async def navigate_url_a():
        try:
            await page_a.goto(test_config.url_a, wait_until="domcontentloaded", timeout=60000)
            print(f"[背景任務完成] URL_A 導航完成，當前 URL: {page_a.url}", flush=True)
            logger.info(f"URL_A 導航完成，當前 URL: {page_a.url}")
        except Exception as e:
            print(f"[背景任務警告] URL_A 導航出錯: {str(e)}", flush=True)
            logger.warning(f"URL_A 導航出錯: {str(e)}")
    
    url_a_task = asyncio.create_task(navigate_url_a())
    print("[成功] URL_A 導航任務已啟動（背景執行中）", flush=True)
    logger.info("URL_A 導航任務已啟動（背景執行中）")
    
    # 立即等待 3 秒，然後開始載入 URL_B（不等待 URL_A 完成）
    print("[等待] 等待 3 秒後開始載入 URL_B（URL_A 在背景繼續載入）...", flush=True)
    await asyncio.sleep(3)
    print("[狀態] 3 秒等待完成，開始開啟第二個瀏覽器視窗...", flush=True)
    logger.info("3 秒等待完成，開始開啟第二個瀏覽器視窗...")
    
    # 第一個頁面載入完成後，再創建第二個瀏覽器視窗
    print("[步驟] 正在創建 browser_b...")
    logger.info("正在創建 browser_b...")
    try:
        browser_b = await playwright_instance.chromium.launch(headless=False)
        print("[成功] browser_b 創建成功")
        logger.info("browser_b 創建成功")
    except Exception as e:
        print(f"[錯誤] browser_b 創建失敗: {str(e)}")
        logger.error(f"browser_b 創建失敗: {str(e)}")
        raise
    
    print("[步驟] 正在創建 context_b...")
    logger.info("正在創建 context_b...")
    try:
        context_b = await browser_b.new_context(
            viewport={"width": 1280, "height": 720},
            ignore_https_errors=True
        )
        print("[成功] context_b 創建成功")
        logger.info("context_b 創建成功")
    except Exception as e:
        print(f"[錯誤] context_b 創建失敗: {str(e)}")
        logger.error(f"context_b 創建失敗: {str(e)}")
        try:
            await browser_b.close()
        except Exception:
            pass
        raise
    
    print("[步驟] 正在創建 page_b...")
    logger.info("正在創建 page_b...")
    try:
        page_b = await context_b.new_page()
        print("[成功] page_b 創建成功")
        logger.info("page_b 創建成功")
    except Exception as e:
        print(f"[錯誤] page_b 創建失敗: {str(e)}")
        logger.error(f"page_b 創建失敗: {str(e)}")
        try:
            await context_b.close()
            await browser_b.close()
        except Exception:
            pass
        raise
    
    # 初始化組件（現在兩個頁面都已準備好）
    screenshot_engine_a = ScreenshotEngine(page_a, test_config.exclude_node_paths)
    screenshot_engine_b = ScreenshotEngine(page_b, test_config.exclude_node_paths)
    diff_engine = DiffEngine(threshold=test_config.diff_threshold)
    report_generator = ReportGenerator(reports_dir=test_config.reports_dir)
    
    # WebSocket 和 HTTP 監聽器
    ws_monitor_a = WebSocketMonitor(page_a)
    ws_monitor_b = WebSocketMonitor(page_b)
    http_monitor_a = HTTPMonitor(page_a)
    http_monitor_b = HTTPMonitor(page_b)
    
    test_results = []
    
    # 導航到 URL_B
    print(f"[步驟] 準備導航到 URL_B: {test_config.url_b}")
    logger.info(f"準備導航到 URL_B: {test_config.url_b}")
    try:
        print("[執行] 開始執行 page_b.goto()...")
        logger.info("開始執行 page_b.goto()...")
        # 使用 "domcontentloaded" 而不是 "load"，因為我們不需要等待所有資源載入
        await page_b.goto(test_config.url_b, wait_until="domcontentloaded", timeout=60000)
        page_title = await page_b.title()
        print(f"[成功] URL_B 導航成功，當前 URL: {page_b.url}")
        print(f"[成功] URL_B 頁面標題: {page_title}")
        logger.info(f"URL_B 導航成功，當前 URL: {page_b.url}")
        logger.info(f"URL_B 頁面標題: {page_title}")
        
        # 等待 Canvas 載入（如果需要）
        print("[等待] 等待 URL_B 的 Canvas 載入...")
        await page_b.wait_for_selector('canvas', timeout=30000)
        print("[成功] URL_B Canvas 已載入")
        logger.info("URL_B Canvas 已載入")
        
    except Exception as e:
        print(f"[錯誤] URL_B 導航失敗: {str(e)}")
        print(f"[錯誤] 錯誤類型: {type(e).__name__}")
        logger.error(f"URL_B 導航失敗: {str(e)}")
        logger.error(f"錯誤類型: {type(e).__name__}")
        import traceback
        error_trace = traceback.format_exc()
        print(f"[錯誤] 完整錯誤堆疊:\n{error_trace}")
        logger.error(f"完整錯誤堆疊:\n{error_trace}")
        # 清理資源
        try:
            await context_b.close()
            await browser_b.close()
        except Exception:
            pass
        raise
    
    # 等待 Cocos 載入
    print("[等待] 等待 URL_B 的 Cocos 載入（3秒）...")
    logger.info("等待 URL_B 的 Cocos 載入（3秒）...")
    await asyncio.sleep(3)
    print("[狀態] URL_B Cocos 載入等待完成，準備執行測試案例")
    logger.info("URL_B Cocos 載入等待完成，準備執行測試案例")
    
    # 執行每個測試案例
    for test_case in test_cases:
        test_name = test_case.get("name", "Unknown")
        logger.info(f"執行測試案例: {test_name}")
        
        try:
            # 重置策略：每個測試案例開始前的清理和重置
            # 1. 清理 WebSocket 訊息歷史
            await asyncio.gather(
                page_a.evaluate("() => { if (window.__wsMessages) window.__wsMessages = []; }"),
                page_b.evaluate("() => { if (window.__wsMessages) window.__wsMessages = []; }")
            )
            
            # 2. 清除 localStorage
            await asyncio.gather(
                page_a.evaluate("() => { localStorage.clear(); }"),
                page_b.evaluate("() => { localStorage.clear(); }")
            )
            
            # 3. 智能頁面重置：檢查第一個步驟是否為 navigate
            steps = test_case.get("steps", [])
            first_step = steps[0] if steps else None
            
            if first_step and first_step.get("action") != "navigate":
                # 如果第一個步驟不是 navigate，先導航回初始頁面（順序執行，避免快速雙開）
                logger.info(f"重置頁面到初始 URL")
                try:
                    await page_a.goto(test_config.url_a, wait_until="domcontentloaded", timeout=60000)
                    await page_a.wait_for_selector('canvas', timeout=30000)
                except Exception as e:
                    logger.error(f"重置 URL_A 失敗: {str(e)}")
                    raise
                
                await asyncio.sleep(2)  # 延遲後再開啟第二個頁面
                
                try:
                    await page_b.goto(test_config.url_b, wait_until="domcontentloaded", timeout=60000)
                    await page_b.wait_for_selector('canvas', timeout=30000)
                except Exception as e:
                    logger.error(f"重置 URL_B 失敗: {str(e)}")
                    raise
                # 等待 Cocos 載入
                await asyncio.sleep(2)
            
            # 執行測試步驟
            
            # 並行執行步驟
            for step in steps:
                # 為兩個頁面分別準備步驟配置
                step_a = step.copy()
                step_b = step.copy()
                
                # 替換 URL 佔位符
                if "url" in step_a:
                    step_a["url"] = step_a["url"].replace("{url}", test_config.url_a)
                if "url" in step_b:
                    step_b["url"] = step_b["url"].replace("{url}", test_config.url_b)
                
                # 在兩個頁面上並行執行相同操作
                await asyncio.gather(
                    execute_action(step_a, page_a),
                    execute_action(step_b, page_b)
                )
            
            # 處理 API 等待
            wait_for_api = test_case.get("wait_for_api")
            if wait_for_api:
                if wait_for_api == "payout":
                    await asyncio.gather(
                        ws_monitor_a.wait_for_payout(timeout=test_config.timeout),
                        ws_monitor_b.wait_for_payout(timeout=test_config.timeout)
                    )
                elif wait_for_api == "openround":
                    await asyncio.gather(
                        ws_monitor_a.wait_for_openround(timeout=test_config.timeout),
                        ws_monitor_b.wait_for_openround(timeout=test_config.timeout)
                    )
            
            # 等待動畫完成（額外等待時間）
            await asyncio.sleep(1)
            
            # 截圖配置
            screenshot_config = test_case.get("screenshot", {})
            mode = screenshot_config.get("mode", "full_page")
            element_node_path = screenshot_config.get("element_node_path")
            
            # 生成截圖路徑
            screenshot_dir_a = os.path.join(test_config.screenshot_dir, "url_a")
            screenshot_dir_b = os.path.join(test_config.screenshot_dir, "url_b")
            os.makedirs(screenshot_dir_a, exist_ok=True)
            os.makedirs(screenshot_dir_b, exist_ok=True)
            
            safe_test_name = "".join(c for c in test_name if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_test_name = safe_test_name.replace(' ', '_')
            
            screenshot_path_a = os.path.join(screenshot_dir_a, f"{safe_test_name}.png")
            screenshot_path_b = os.path.join(screenshot_dir_b, f"{safe_test_name}.png")
            
            # 並行截圖
            await asyncio.gather(
                screenshot_engine_a.take_screenshot(
                    screenshot_path_a,
                    mode=mode,
                    element_node_path=element_node_path
                ),
                screenshot_engine_b.take_screenshot(
                    screenshot_path_b,
                    mode=mode,
                    element_node_path=element_node_path
                )
            )
            
            # 圖像比對
            diff_dir = os.path.join(test_config.screenshot_dir, "diffs")
            os.makedirs(diff_dir, exist_ok=True)
            diff_output_path = os.path.join(diff_dir, f"{safe_test_name}_diff.png")
            
            diff_result = diff_engine.compare_images(
                screenshot_path_a,
                screenshot_path_b,
                diff_output_path
            )
            
            # 記錄測試結果
            passed = not diff_result.get("is_different", True)
            expected = test_case.get("expected", "")
            
            test_result = {
                "test_name": test_name,
                "passed": passed,
                "expected": expected,
                "screenshot_a": screenshot_path_a,
                "screenshot_b": screenshot_path_b,
                "diff_output_path": diff_output_path if not passed else None,
                "diff_info": diff_result if not passed else None,
                "actual_diff": f"差異比例: {diff_result.get('diff_ratio', 0):.2%}" if not passed else None
            }
            
            test_results.append(test_result)
            
            if passed:
                logger.success(f"測試案例 '{test_name}' 通過")
            else:
                logger.error(f"測試案例 '{test_name}' 失敗: 差異比例 {diff_result.get('diff_ratio', 0):.2%}")
                # 測試失敗時也繼續執行其他測試案例
                # pytest 不會因為這個失敗而停止
        
        except Exception as e:
            logger.error(f"測試案例 '{test_name}' 執行失敗: {str(e)}")
            test_results.append({
                "test_name": test_name,
                "passed": False,
                "expected": test_case.get("expected", ""),
                "error": str(e)
            })
    
    # 生成測試報告
    html_report_path = report_generator.generate_html_report(test_results)
    text_report_path = report_generator.generate_text_report(test_results)
    json_report_path = report_generator.generate_json_report(test_results)
    
    logger.info(f"HTML 報告已生成: {html_report_path}")
    logger.info(f"文字報告已生成: {text_report_path}")
    logger.info(f"JSON 報告已生成: {json_report_path}")
    
    # 統計測試結果
    passed_count = sum(1 for r in test_results if r.get("passed"))
    failed_count = len(test_results) - passed_count
    
    logger.info(f"測試完成: 通過 {passed_count}/{len(test_results)}, 失敗 {failed_count}/{len(test_results)}")
    
    # 清理第二個瀏覽器資源
    try:
        await context_b.close()
        await browser_b.close()
        logger.info("第二個瀏覽器視窗已關閉")
    except Exception as e:
        logger.warning(f"關閉第二個瀏覽器時發生錯誤（可忽略）: {str(e)}")
    
    # 如果有失敗的測試，讓 pytest 知道
    if failed_count > 0:
        pytest.fail(f"{failed_count} 個測試案例失敗，詳見測試報告")

