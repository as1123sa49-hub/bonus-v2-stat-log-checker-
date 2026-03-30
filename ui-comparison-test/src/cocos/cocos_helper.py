"""Cocos Creator API 封裝模組"""
from typing import Optional, Dict, Any
from playwright.async_api import Page


def get_find_node_script() -> str:
    """
    生成在瀏覽器環境中使用的 findNode 函數腳本
    用於在 Cocos 節點樹中查找指定名稱的節點
    
    Returns:
        str: JavaScript 程式碼字串
    """
    return """
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
    """


async def get_canvas(page: Page) -> bool:
    """
    檢查 Cocos Canvas 節點是否存在
    
    Args:
        page: Playwright Page 物件
        
    Returns:
        bool: Canvas 是否存在
    """
    return await page.evaluate("""() => {
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
        let canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
        
        if (!canvas) {
          const main = findNode(scene, 'Main');
          if (main) {
            canvas = main.getChildByName('Canvas');
          }
        }
        
        return !!canvas;
      } catch (e) {
        return false;
      }
    }""")


async def get_current_view(page: Page) -> Optional[str]:
    """
    獲取當前視圖名稱
    
    Args:
        page: Playwright Page 物件
        
    Returns:
        Optional[str]: 視圖名稱（如 'ColorGameLobbyView' 或 'ColorGameRoomView'），如果無法獲取則返回 None
    """
    return await page.evaluate("""() => {
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
        let canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
        
        if (!canvas) {
          const main = findNode(scene, 'Main');
          if (main) {
            canvas = main.getChildByName('Canvas');
          }
        }
        
        if (!canvas) return null;
        
        const viewRoot = canvas.getChildByName('viewRoot');
        if (!viewRoot) return null;
        
        const layerDefault = viewRoot.getChildByName('Layer_Default');
        if (!layerDefault) return null;
        
        // 檢查是否在房間視圖
        const roomView = layerDefault.getChildByName('ColorGameRoomView');
        if (roomView && roomView.active) {
          return 'ColorGameRoomView';
        }
        
        // 檢查是否在大廳視圖
        const lobbyView = layerDefault.getChildByName('ColorGameLobbyView');
        if (lobbyView && lobbyView.active) {
          return 'ColorGameLobbyView';
        }
        
        return null;
      } catch (e) {
        return null;
      }
    }""")

