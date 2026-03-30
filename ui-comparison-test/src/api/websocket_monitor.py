"""WebSocket 監聽器模組"""
import asyncio
from typing import Optional, Dict, Any, Callable
from playwright.async_api import Page


class WebSocketMonitor:
    """WebSocket 訊息監聽器"""
    
    def __init__(self, page: Page):
        """
        初始化 WebSocket 監聽器
        
        Args:
            page: Playwright Page 物件
        """
        self.page = page
        self.messages: list = []
        self.monitoring = False
    
    async def start_monitoring(self):
        """開始監聽 WebSocket 訊息"""
        if self.monitoring:
            return
        
        self.monitoring = True
        
        # 注入 WebSocket 監聽腳本（需要在頁面載入前注入）
        await self.page.add_init_script("""() => {
          if (window.__wsMessages) return; // 已經初始化過了
          
          window.__wsMessages = [];
          
          // 攔截 WebSocket
          const OriginalWebSocket = window.WebSocket;
          
          window.WebSocket = function(url, protocols) {
            const ws = new OriginalWebSocket(url, protocols);
            
            ws.addEventListener('message', function(event) {
              try {
                const rawData = typeof event.data === 'string' ? event.data : event.data.toString();
                window.__wsMessages.push({
                  data: rawData,
                  timestamp: Date.now()
                });
              } catch (e) {
                console.error('Error capturing WebSocket message:', e);
              }
            });
            
            return ws;
          };
          
          window.WebSocket.prototype = OriginalWebSocket.prototype;
        }""")
    
    async def get_messages(self, event_type: Optional[str] = None) -> list:
        """
        獲取監聽到的訊息
        
        Args:
            event_type: 過濾訊息類型（'send' 或 'receive'），如果為 None 則返回所有訊息
            
        Returns:
            list: 訊息列表
        """
        messages = await self.page.evaluate("""() => {
          return window.__wsMessages || [];
        }""")
        
        if event_type:
            messages = [msg for msg in messages if msg.get("type") == event_type]
        
        return messages
    
    async def wait_for_payout(self, round_code: Optional[str] = None, timeout: int = 30000) -> Optional[Dict[str, Any]]:
        """
        等待 payout 事件
        
        Args:
            round_code: 目標局號，如果為 None 則等待任何 payout 事件
            timeout: 超時時間（毫秒）
            
        Returns:
            Optional[Dict[str, Any]]: payout 事件數據，如果超時則返回 None
        """
        await self.start_monitoring()
        
        start_time = asyncio.get_event_loop().time() * 1000  # 轉換為毫秒
        
        while True:
            current_time = asyncio.get_event_loop().time() * 1000
            if current_time - start_time > timeout:
                return None
            
            # 直接在瀏覽器環境中檢查訊息
            result = await self.page.evaluate("""([targetRoundCode]) => {
              const messages = window.__wsMessages || [];
              for (let i = messages.length - 1; i >= 0; i--) {
                try {
                  let data = messages[i].data || '';
                  if (typeof data === 'string' && data.startsWith('$#|#$')) {
                    data = data.substring(5);
                  }
                  
                  if (typeof data === 'string') {
                    const parsed = JSON.parse(data);
                    const eventType = parsed?.d?.v?.['3'];
                    const round = parsed?.d?.v?.['10']?.['0'];
                    
                    if (eventType === 'payout') {
                      if (targetRoundCode === null || round === targetRoundCode) {
                        return {
                          event_type: eventType,
                          round_code: round,
                          data: parsed.d.v['10'],
                          timestamp: messages[i].timestamp
                        };
                      }
                    }
                  }
                } catch (e) {
                  // 忽略解析錯誤
                }
              }
              return null;
            }""", round_code)
            
            if result:
                return result
            
            await asyncio.sleep(0.5)  # 等待 500ms 後再次檢查
    
    async def wait_for_openround(self, round_code: Optional[str] = None, timeout: int = 30000) -> Optional[Dict[str, Any]]:
        """
        等待 openround 事件
        
        Args:
            round_code: 目標局號，如果為 None 則等待任何 openround 事件
            timeout: 超時時間（毫秒）
            
        Returns:
            Optional[Dict[str, Any]]: openround 事件數據，如果超時則返回 None
        """
        await self.start_monitoring()
        
        start_time = asyncio.get_event_loop().time() * 1000
        
        while True:
            current_time = asyncio.get_event_loop().time() * 1000
            if current_time - start_time > timeout:
                return None
            
            # 直接在瀏覽器環境中檢查訊息
            result = await self.page.evaluate("""([targetRoundCode]) => {
              const messages = window.__wsMessages || [];
              for (let i = messages.length - 1; i >= 0; i--) {
                try {
                  let data = messages[i].data || '';
                  if (typeof data === 'string' && data.startsWith('$#|#$')) {
                    data = data.substring(5);
                  }
                  
                  if (typeof data === 'string') {
                    const parsed = JSON.parse(data);
                    const eventType = parsed?.d?.v?.['3'];
                    const round = parsed?.d?.v?.['10']?.['0'];
                    
                    if (eventType === 'openround') {
                      if (targetRoundCode === null || round === targetRoundCode) {
                        return {
                          event_type: eventType,
                          round_code: round,
                          data: parsed.d.v['10'],
                          timestamp: messages[i].timestamp
                        };
                      }
                    }
                  }
                } catch (e) {
                  // 忽略解析錯誤
                }
              }
              return null;
            }""", round_code)
            
            if result:
                return result
            
            await asyncio.sleep(0.5)

