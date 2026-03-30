"""截圖引擎模組"""
import os
from typing import Optional, Dict, Any, List
from pathlib import Path
from playwright.async_api import Page
from .exclusion_handler import ExclusionHandler
from ..cocos.node_locator import get_node_bounding_box


class ScreenshotEngine:
    """截圖引擎"""
    
    def __init__(self, page: Page, exclude_node_paths: List[str] = None):
        """
        初始化截圖引擎
        
        Args:
            page: Playwright Page 物件
            exclude_node_paths: 需要排除的 Cocos 節點路徑列表
        """
        self.page = page
        self.exclude_handler = ExclusionHandler(page, exclude_node_paths or [])
    
    async def take_screenshot(
        self,
        output_path: str,
        mode: str = "full_page",
        element_node_path: Optional[str] = None
    ) -> str:
        """
        截取螢幕截圖
        
        Args:
            output_path: 輸出檔案路徑
            mode: 截圖模式（'full_page', 'element', 'both'）
            element_node_path: 元素節點路徑（當 mode 為 'element' 或 'both' 時需要）
            
        Returns:
            str: 截圖檔案路徑
        """
        # 確保輸出目錄存在
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        # 隱藏排除區域
        await self.exclude_handler.hide_excluded_regions()
        
        try:
            if mode == "full_page":
                await self.page.screenshot(path=output_path, full_page=True)
            elif mode == "element":
                if not element_node_path:
                    raise ValueError("element_node_path 必須提供當 mode 為 'element' 時")
                
                # 獲取元素的邊界框
                bbox = await get_node_bounding_box(self.page, element_node_path)
                if not bbox:
                    raise ValueError(f"無法獲取節點 {element_node_path} 的邊界框")
                
                # 截取元素區域
                await self.page.screenshot(
                    path=output_path,
                    clip={
                        "x": bbox["x"],
                        "y": bbox["y"],
                        "width": bbox["width"],
                        "height": bbox["height"]
                    }
                )
            elif mode == "both":
                # 整頁截圖
                full_page_path = output_path.replace(".png", "_full.png")
                await self.page.screenshot(path=full_page_path, full_page=True)
                
                # 元素截圖
                if element_node_path:
                    element_path = output_path.replace(".png", "_element.png")
                    bbox = await get_node_bounding_box(self.page, element_node_path)
                    if bbox:
                        await self.page.screenshot(
                            path=element_path,
                            clip={
                                "x": bbox["x"],
                                "y": bbox["y"],
                                "width": bbox["width"],
                                "height": bbox["height"]
                            }
                        )
                    # 返回整頁截圖路徑作為主要路徑
                    return full_page_path
                else:
                    await self.page.screenshot(path=output_path, full_page=True)
            else:
                raise ValueError(f"不支援的截圖模式: {mode}")
            
            return output_path
        finally:
            # 恢復排除區域
            await self.exclude_handler.restore_excluded_regions()

