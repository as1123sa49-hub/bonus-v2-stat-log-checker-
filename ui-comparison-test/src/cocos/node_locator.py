"""Cocos Creator 節點定位器模組"""
from typing import Optional, Dict, Any, List
from playwright.async_api import Page


async def find_node_by_path(page: Page, node_path: str) -> Optional[Dict[str, Any]]:
    """
    根據節點路徑查找 Cocos 節點
    
    Args:
        page: Playwright Page 物件
        node_path: 節點路徑，例如 "Canvas/viewRoot/Layer_Default/ColorGameRoomView"
        
    Returns:
        Optional[Dict[str, Any]]: 節點資訊字典，包含 node 物件的引用資訊，如果找不到則返回 None
    """
    path_parts = [p.strip() for p in node_path.split("/") if p.strip()]
    
    if not path_parts:
        return None
    
    find_node_script = get_find_node_script()
    
    result = await page.evaluate("""([pathParts]) => {
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
        if (!scene) return { found: false, error: 'scene not found' };
        
        // 嘗試找到 Canvas
        let current = scene;
        if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
          current = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          if (!current) {
            const main = findNode(scene, 'Main');
            if (main) current = main.getChildByName('Canvas');
          }
        }
        
        if (!current) return { found: false, error: 'Canvas not found' };
        
        // 根據路徑遍歷節點
        for (const part of pathParts) {
          if (!current) break;
          if (part === 'Canvas' && (current.name === 'Canvas' || current.name === 'canvas')) {
            continue;
          }
          current = current.getChildByName(part);
        }
        
        if (current) {
          return {
            found: true,
            nodeName: current.name,
            active: current.active !== undefined ? current.active : true
          };
        } else {
          return { found: false, error: 'node not found at path: ' + pathParts.join('/') };
        }
      } catch (e) {
        return { found: false, error: e.message };
      }
    }""", path_parts)
    
    if result and result.get("found"):
        return result
    return None


async def get_node_bounding_box(page: Page, node_path: str) -> Optional[Dict[str, float]]:
    """
    獲取節點的邊界框（bounding box）
    
    Args:
        page: Playwright Page 物件
        node_path: 節點路徑
        
    Returns:
        Optional[Dict[str, float]]: 包含 x, y, width, height 的字典，如果無法獲取則返回 None
    """
    path_parts = [p.strip() for p in node_path.split("/") if p.strip()]
    
    if not path_parts:
        return None
    
    find_node_script = get_find_node_script()
    
    result = await page.evaluate("""([pathParts]) => {
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
        if (!scene) return null;
        
        // 找到 Canvas
        let canvas = scene;
        if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
          canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          if (!canvas) {
            const main = findNode(scene, 'Main');
            if (main) canvas = main.getChildByName('Canvas');
          }
        }
        
        if (!canvas) return null;
        
        // 根據路徑找到節點
        let current = canvas;
        for (const part of pathParts) {
          if (!current) break;
          if (part === 'Canvas' && (current.name === 'Canvas' || current.name === 'canvas')) {
            continue;
          }
          current = current.getChildByName(part);
        }
        
        if (!current) return null;
        
        // 獲取節點的邊界框
        const boundingBox = current.getBoundingBox();
        if (!boundingBox) return null;
        
        // 將世界座標轉換為螢幕座標
        // 需要考慮 Canvas 的縮放和位移
        const canvasComponent = canvas.getComponent(cc.Canvas);
        const designResolution = canvasComponent ? canvasComponent.designResolution : { width: 1920, height: 1080 };
        const view = canvasComponent ? canvasComponent.view : null;
        
        // 獲取節點的世界位置
        const worldPos = current.convertToWorldSpaceAR(cc.v2(0, 0));
        
        // 轉換為螢幕座標
        let screenX = worldPos.x;
        let screenY = worldPos.y;
        
        if (view) {
          const viewportRect = view.getViewportRect();
          screenX = (worldPos.x - viewportRect.x) * (view._designResolutionSize.width / viewportRect.width);
          screenY = (worldPos.y - viewportRect.y) * (view._designResolutionSize.height / viewportRect.height);
        }
        
        return {
          x: screenX - boundingBox.width / 2,
          y: screenY - boundingBox.height / 2,
          width: boundingBox.width,
          height: boundingBox.height
        };
      } catch (e) {
        console.error('Error getting bounding box:', e);
        return null;
      }
    }""", path_parts)
    
    return result


async def hide_node_by_path(page: Page, node_path: str) -> bool:
    """
    隱藏指定節點（用於排除區域）
    
    Args:
        page: Playwright Page 物件
        node_path: 節點路徑
        
    Returns:
        bool: 是否成功隱藏節點
    """
    path_parts = [p.strip() for p in node_path.split("/") if p.strip()]
    
    if not path_parts:
        return False
    
    find_node_script = get_find_node_script()
    
    result = await page.evaluate("""([pathParts]) => {
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
          // 隱藏節點
          if (current.active !== undefined) {
            current.active = false;
          } else if (current.opacity !== undefined) {
            current.opacity = 0;
          }
          return { success: true };
        } else {
          return { success: false, error: 'node not found' };
        }
      } catch (e) {
        return { success: false, error: e.message };
      }
    }""", path_parts)
    
    return result.get("success", False) if result else False


async def restore_node_by_path(page: Page, node_path: str) -> bool:
    """
    恢復節點顯示狀態（在截圖完成後調用）
    
    Args:
        page: Playwright Page 物件
        node_path: 節點路徑
        
    Returns:
        bool: 是否成功恢復節點
    """
    path_parts = [p.strip() for p in node_path.split("/") if p.strip()]
    
    if not path_parts:
        return False
    
    find_node_script = get_find_node_script()
    
    result = await page.evaluate("""([pathParts]) => {
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
        if (!scene) return { success: false };
        
        let canvas = scene;
        if (scene.name !== 'Canvas' && scene.name !== 'canvas') {
          canvas = findNode(scene, 'Canvas') || findNode(scene, 'canvas');
          if (!canvas) {
            const main = findNode(scene, 'Main');
            if (main) canvas = main.getChildByName('Canvas');
          }
        }
        
        if (!canvas) return { success: false };
        
        let current = canvas;
        for (const part of pathParts) {
          if (!current) break;
          if (part === 'Canvas' && (current.name === 'Canvas' || current.name === 'canvas')) {
            continue;
          }
          current = current.getChildByName(part);
        }
        
        if (current) {
          // 恢復節點顯示
          if (current.active !== undefined) {
            current.active = true;
          } else if (current.opacity !== undefined) {
            current.opacity = 255;
          }
          return { success: true };
        } else {
          return { success: false };
        }
      } catch (e) {
        return { success: false };
      }
    }""", path_parts)
    
    return result.get("success", False) if result else False

