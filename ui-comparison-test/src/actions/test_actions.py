"""測試操作封裝模組"""
import asyncio
from typing import Dict, Any, Optional
from playwright.async_api import Page
from ..cocos.node_locator import find_node_by_path


async def execute_action(action_config: Dict[str, Any], page: Page):
    """
    執行測試步驟操作
    
    Args:
        action_config: 操作配置字典
        page: Playwright Page 物件
        
    Raises:
        ValueError: 當操作類型不支援時
    """
    action_type = action_config.get("action")
    
    if action_type == "click":
        await click_node(page, action_config.get("cocos_node_path"))
    elif action_type == "navigate":
        url = action_config.get("url", "")
        # 替換 {url} 佔位符（如果需要）
        url = url.replace("{url}", "")
        await page.goto(url)
        await page.wait_for_load_state("networkidle")
    elif action_type == "wait_for_openround":
        # 等待 openround 事件（需要在測試中通過 WebSocketMonitor 實現）
        await asyncio.sleep(2)  # 臨時等待，實際應該等待 API 事件
    elif action_type == "wait_for_payout":
        # 等待 payout 事件（需要在測試中通過 WebSocketMonitor 實現）
        await asyncio.sleep(2)  # 臨時等待，實際應該等待 API 事件
    elif action_type == "wait_for_loading":
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(1)  # 額外等待載入完成
    elif action_type == "wait_for_marquee":
        await asyncio.sleep(2)  # 等待跑馬燈載入
    elif action_type == "wait_for_ad":
        await asyncio.sleep(2)  # 等待廣告載入
    elif action_type == "wait_for_console":
        await asyncio.sleep(1)  # 等待 console 輸出
    elif action_type == "enter_room":
        room = action_config.get("room")
        # 這裡需要實現進房邏輯（可能需要點擊房間節點）
        await asyncio.sleep(2)
    elif action_type == "exit_room":
        # 這裡需要實現出房邏輯
        await asyncio.sleep(2)
    elif action_type == "place_bet":
        amount = action_config.get("amount", 0)
        # 這裡需要實現下注邏輯
        await asyncio.sleep(2)
    else:
        raise ValueError(f"不支援的操作類型: {action_type}")


async def click_node(page: Page, node_path: str):
    """
    點擊 Cocos 節點
    
    Args:
        page: Playwright Page 物件
        node_path: Cocos 節點路徑
    """
    # 先查找節點確認存在
    node_info = await find_node_by_path(page, node_path)
    if not node_info or not node_info.get("found"):
        raise ValueError(f"無法找到節點: {node_path}")
    
    # 通過 page.evaluate 觸發節點的點擊事件
    path_parts = [p.strip() for p in node_path.split("/") if p.strip()]
    
    await page.evaluate("""([pathParts]) => {
      function findNode(node, name) {
        if (!node) return null;
        if (node.name === name) return node;
        if (node.children) {
          for (let child of node.children) {
            const found = findNode(child, name);
            if (found) return found;
          }
        }
        return null;
      }
      
      try {
        const scene = cc.director.getScene();
        if (!scene) return { success: false, error: 'scene not found' };
        
        let canvas = scene;
        if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
          canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          if (!canvas) {
            const main = findNode(scene, 'Main');
            if (main) canvas = main.getChildByName('Canvas');
          }
        }
        
        if (!canvas) return { success: false, error: 'Canvas not found' };
        
        let current = canvas;
        for (const part of pathParts) {
          if (!current) break;
          if (part === 'Canvas' && (current.name === 'Canvas' || current.name === 'canvas')) {
            continue;
          }
          current = current.getChildByName(part);
        }
        
        if (current) {
          // 觸發點擊事件
          const event = new cc.Event.EventMouse(cc.Event.EventMouse.DOWN);
          current.dispatchEvent(event);
          // 也可以嘗試調用節點的 onTouchEnd 或其他點擊處理方法
          return { success: true };
        } else {
          return { success: false, error: 'node not found' };
        }
      } catch (e) {
        return { success: false, error: e.message };
      }
    }""", path_parts)


async def wait_for_cocos_node(page: Page, node_path: str, timeout: int = 30000) -> bool:
    """
    等待 Cocos 節點出現（輪詢檢查）
    
    Args:
        page: Playwright Page 物件
        node_path: Cocos 節點路徑
        timeout: 超時時間（毫秒）
        
    Returns:
        bool: 節點是否存在
    """
    start_time = asyncio.get_event_loop().time() * 1000
    
    while True:
        current_time = asyncio.get_event_loop().time() * 1000
        if current_time - start_time > timeout:
            return False
        
        node_info = await find_node_by_path(page, node_path)
        if node_info and node_info.get("found"):
            return True
        
        await asyncio.sleep(0.5)

