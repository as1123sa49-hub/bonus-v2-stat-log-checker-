"""HTTP 請求監聽器模組"""
from typing import Optional, Dict, Any, List, Callable
from playwright.async_api import Page, Route, Request, Response


class HTTPMonitor:
    """HTTP 請求監聽器"""
    
    def __init__(self, page: Page):
        """
        初始化 HTTP 監聽器
        
        Args:
            page: Playwright Page 物件
        """
        self.page = page
        self.requests: List[Dict[str, Any]] = []
        self.responses: List[Dict[str, Any]] = []
        self.monitoring = False
    
    async def start_monitoring(self, url_pattern: Optional[str] = None):
        """
        開始監聽 HTTP 請求
        
        Args:
            url_pattern: URL 模式（例如包含 'payout' 的請求），如果為 None 則監聽所有請求
        """
        if self.monitoring:
            return
        
        self.monitoring = True
        
        async def handle_route(route: Route):
            request = route.request
            timestamp = route.request.timing.get("startTime", 0) if hasattr(route.request, "timing") else 0
            
            self.requests.append({
                "url": request.url,
                "method": request.method,
                "headers": request.headers,
                "timestamp": timestamp
            })
            
            # 繼續處理請求
            await route.continue_()
        
        # 設置路由攔截
        if url_pattern:
            await self.page.route(f"**/*{url_pattern}*", handle_route)
        else:
            await self.page.route("**/*", handle_route)
        
        # 監聽響應
        self.page.on("response", self._handle_response)
    
    def _handle_response(self, response: Response):
        """處理響應事件"""
        timestamp = response.request.timing.get("responseEnd", 0) if hasattr(response.request, "timing") else 0
        
        self.responses.append({
            "url": response.url,
            "status": response.status,
            "headers": response.headers,
            "timestamp": timestamp
        })
    
    async def wait_for_request(self, url_pattern: str, timeout: int = 30000) -> Optional[Dict[str, Any]]:
        """
        等待包含特定模式的請求
        
        Args:
            url_pattern: URL 模式（例如 'payout'）
            timeout: 超時時間（毫秒）
            
        Returns:
            Optional[Dict[str, Any]]: 請求數據，如果超時則返回 None
        """
        await self.start_monitoring()
        
        import asyncio
        start_time = asyncio.get_event_loop().time() * 1000
        
        while True:
            current_time = asyncio.get_event_loop().time() * 1000
            if current_time - start_time > timeout:
                return None
            
            # 檢查是否有匹配的請求
            for req in self.requests:
                if url_pattern in req.get("url", ""):
                    return req
            
            await asyncio.sleep(0.5)
    
    async def wait_for_response(self, url_pattern: str, timeout: int = 30000) -> Optional[Dict[str, Any]]:
        """
        等待包含特定模式的響應
        
        Args:
            url_pattern: URL 模式（例如 'payout'）
            timeout: 超時時間（毫秒）
            
        Returns:
            Optional[Dict[str, Any]]: 響應數據，如果超時則返回 None
        """
        await self.start_monitoring()
        
        import asyncio
        start_time = asyncio.get_event_loop().time() * 1000
        
        while True:
            current_time = asyncio.get_event_loop().time() * 1000
            if current_time - start_time > timeout:
                return None
            
            # 檢查是否有匹配的響應
            for resp in self.responses:
                if url_pattern in resp.get("url", ""):
                    return resp
            
            await asyncio.sleep(0.5)
    
    async def stop_monitoring(self):
        """停止監聽"""
        if not self.monitoring:
            return
        
        # 清除路由攔截
        await self.page.unroute("**/*")
        self.monitoring = False

