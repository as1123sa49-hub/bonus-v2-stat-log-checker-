"""排除區域處理模組"""
from typing import List
from playwright.async_api import Page
from ..cocos.node_locator import hide_node_by_path, restore_node_by_path


class ExclusionHandler:
    """排除區域處理器"""
    
    def __init__(self, page: Page, exclude_node_paths: List[str]):
        """
        初始化排除區域處理器
        
        Args:
            page: Playwright Page 物件
            exclude_node_paths: 需要排除的 Cocos 節點路徑列表
        """
        self.page = page
        self.exclude_node_paths = exclude_node_paths
        self.hidden_nodes: List[str] = []
    
    async def hide_excluded_regions(self):
        """隱藏排除區域"""
        for node_path in self.exclude_node_paths:
            success = await hide_node_by_path(self.page, node_path)
            if success:
                self.hidden_nodes.append(node_path)
    
    async def restore_excluded_regions(self):
        """恢復排除區域的顯示"""
        for node_path in self.hidden_nodes:
            await restore_node_by_path(self.page, node_path)
        self.hidden_nodes.clear()

