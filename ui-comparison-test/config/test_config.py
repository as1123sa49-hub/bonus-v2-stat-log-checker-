"""測試環境配置管理模組"""
import os
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class TestConfig:
    """測試配置類別"""
    url_a: str  # 基準環境 URL
    url_b: str  # RD 環境 URL
    exclude_node_paths: List[str]  # 排除區域的 Cocos 節點路徑列表（聊天室清單、系統時間等）
    timeout: int = 30000  # 預設超時時間（毫秒）
    retry_count: int = 3  # 預設重試次數
    diff_threshold: float = 0.01  # 差異容忍度（0.01 = 1%）
    screenshot_dir: str = "screenshots"  # 截圖輸出目錄
    reports_dir: str = "reports"  # 報告輸出目錄


def load_config() -> TestConfig:
    """
    從環境變數或配置檔案載入測試配置
    
    Returns:
        TestConfig: 測試配置物件
    """
    url_a = os.getenv("URL_A", "http://192.168.4.25:7456/web-mobile/web-mobile/index.html?infoUrl=f3f826&gameType=31&seo=false&pid=50&username=apitest02&userLevel=4&accessToken=64cc26d5024ba365cd1169a82bfeeb4ae9b4be8d023474fce7215d9ed20d4298a77571031007bf3ec9567c821099d83e13e337d0138c191dca051b9376f1c3feb6027a125052dea585f4c6f606cb4ecf4a05b5295a227e655b590a36da231aa2&defaultVideoPlayMode=trtc&isLobbyEventCenterEnabled=true&isRoomEventCenterEnabled=true&isEventCenterRuleEnabled=true&isShowEventCenterTop10Animation=true&birthday=30-12-2025")
    url_b = os.getenv("URL_B", "http://192.168.2.239/cg/build/web-mobile/?infoUrl=f3f826&gameType=31&seo=false&pid=50&username=apitest03&userLevel=5&accessToken=64cc26d5024ba365cd1169a82bfeeb4ae9b4be8d023474fce7215d9ed20d4298a77571031007bf3ec9567c821099d83e149996558a31db49c72d3915e1b47ffb3b90bc83fbc12f813b0994f2247fc40bf6ae34de1036a1e1367786a3d3a5226d&defaultVideoPlayMode=trtc&isLobbyEventCenterEnabled=true&isRoomEventCenterEnabled=true&isEventCenterRuleEnabled=true&isShowEventCenterTop10Animation=true")
    
    if not url_a or not url_b:
        raise ValueError(
            "請設定環境變數 URL_A 和 URL_B，或在配置檔案中設定。\n"
            "範例：\n"
            "  export URL_A='https://example.com'\n"
            "  export URL_B='https://rd.example.com'"
        )
    
    # 預設排除區域（聊天室清單、系統時間）
    # 這些路徑需要根據實際 Cocos 節點結構進行調整
    default_exclude_paths = [
        # "Canvas/viewRoot/Layer_Default/ColorGameLobbyView/.../ChatPanel",  # 聊天室清單
        # "Canvas/viewRoot/Layer_Default/.../TimeDisplay",  # 系統時間
    ]
    
    exclude_paths = os.getenv("EXCLUDE_NODE_PATHS", "").split(",")
    exclude_paths = [p.strip() for p in exclude_paths if p.strip()]
    exclude_paths = exclude_paths if exclude_paths else default_exclude_paths
    
    timeout = int(os.getenv("TEST_TIMEOUT", "30000"))
    retry_count = int(os.getenv("TEST_RETRY_COUNT", "3"))
    diff_threshold = float(os.getenv("DIFF_THRESHOLD", "0.01"))
    
    return TestConfig(
        url_a=url_a,
        url_b=url_b,
        exclude_node_paths=exclude_paths,
        timeout=timeout,
        retry_count=retry_count,
        diff_threshold=diff_threshold,
        screenshot_dir=os.getenv("SCREENSHOT_DIR", "screenshots"),
        reports_dir=os.getenv("REPORTS_DIR", "reports"),
    )

