"""差異檢測與視覺化模組"""
import os
from typing import Optional, Dict, Any, Tuple, List
from PIL import Image, ImageDraw, ImageFont
import numpy as np


class DiffEngine:
    """差異檢測與視覺化引擎"""
    
    def __init__(self, threshold: float = 0.01):
        """
        初始化差異檢測引擎
        
        Args:
            threshold: 差異容忍度（0.01 = 1%）
        """
        self.threshold = threshold
    
    def compare_images(
        self,
        image_a_path: str,
        image_b_path: str,
        diff_output_path: str
    ) -> Dict[str, Any]:
        """
        比較兩個圖像並生成差異視覺化
        
        Args:
            image_a_path: 基準圖像路徑
            image_b_path: 比對圖像路徑
            diff_output_path: 差異圖像輸出路徑
            
        Returns:
            Dict[str, Any]: 包含差異資訊的字典
        """
        img_a = Image.open(image_a_path)
        img_b = Image.open(image_b_path)
        
        # 確保兩個圖像尺寸相同
        if img_a.size != img_b.size:
            # 調整圖像尺寸
            max_width = max(img_a.width, img_b.width)
            max_height = max(img_a.height, img_b.height)
            img_a = img_a.resize((max_width, max_height), Image.Resampling.LANCZOS)
            img_b = img_b.resize((max_width, max_height), Image.Resampling.LANCZOS)
        
        # 轉換為 RGB 模式（如果需要）
        if img_a.mode != 'RGB':
            img_a = img_a.convert('RGB')
        if img_b.mode != 'RGB':
            img_b = img_b.convert('RGB')
        
        # 使用簡單的像素比對
        diff_img, diff_count, diff_ratio = self._simple_pixel_diff(img_a, img_b)
        
        # 生成視覺化標示（紅色圓圈和矩形）
        visualized_img = self._visualize_differences(img_a.copy(), img_b.copy(), diff_img)
        
        # 保存差異圖像
        os.makedirs(os.path.dirname(diff_output_path), exist_ok=True)
        visualized_img.save(diff_output_path)
        
        # 計算差異區域
        diff_regions = self._calculate_diff_regions(diff_img)
        
        return {
            "diff_count": diff_count,
            "diff_ratio": diff_ratio,
            "is_different": diff_ratio > self.threshold,
            "diff_output_path": diff_output_path,
            "diff_regions": diff_regions,
            "image_size": img_a.size
        }
    
    def _simple_pixel_diff(self, img_a: Image.Image, img_b: Image.Image) -> Tuple[Image.Image, int, float]:
        """
        簡單的像素差異比對（當 pixelmatch 不可用時）
        
        Args:
            img_a: 圖像 A
            img_b: 圖像 B
            
        Returns:
            Tuple[Image.Image, int, float]: (差異圖像, 差異像素數, 差異比例)
        """
        arr_a = np.array(img_a)
        arr_b = np.array(img_b)
        
        # 計算像素差異
        diff = np.abs(arr_a.astype(int) - arr_b.astype(int))
        diff_mask = np.any(diff > 10, axis=2)  # 容許 10 像素誤差
        
        # 生成差異圖像
        diff_img = Image.new('RGB', img_a.size, color='white')
        diff_arr = np.array(diff_img)
        diff_arr[diff_mask] = [255, 0, 0]  # 紅色標示差異
        diff_img = Image.fromarray(diff_arr)
        
        diff_count = int(np.sum(diff_mask))
        total_pixels = img_a.width * img_a.height
        diff_ratio = diff_count / total_pixels if total_pixels > 0 else 0
        
        return diff_img, diff_count, diff_ratio
    
    def _visualize_differences(
        self,
        img_a: Image.Image,
        img_b: Image.Image,
        diff_img: Image.Image
    ) -> Image.Image:
        """
        生成差異視覺化（紅色圓圈和矩形標示）
        
        Args:
            img_a: 圖像 A
            img_b: 圖像 B
            diff_img: 差異圖像
            
        Returns:
            Image.Image: 視覺化後的圖像
        """
        # 創建合成圖像（左右並排顯示 A 和 B，下方顯示差異）
        width, height = img_a.size
        
        # 創建三張圖的合成圖像
        composite_width = width * 2
        composite_height = height * 2
        
        composite = Image.new('RGB', (composite_width, composite_height), color='white')
        
        # 放置圖像 A（左上）
        composite.paste(img_a, (0, 0))
        # 放置圖像 B（右上）
        composite.paste(img_b, (width, 0))
        
        # 放置差異圖像（下方）
        composite.paste(diff_img, (0, height))
        
        # 在差異圖像上繪製紅色圓圈和矩形
        draw = ImageDraw.Draw(composite)
        
        # 計算差異區域
        diff_arr = np.array(diff_img)
        diff_mask = np.any(diff_arr == [255, 0, 0], axis=2)
        
        if np.any(diff_mask):
            # 找到差異區域的邊界
            y_coords, x_coords = np.where(diff_mask)
            
            if len(x_coords) > 0 and len(y_coords) > 0:
                min_x, max_x = int(np.min(x_coords)), int(np.max(x_coords))
                min_y, max_y = int(np.min(y_coords)), int(np.max(y_coords))
                
                center_x = (min_x + max_x) // 2
                center_y = (min_y + max_y) // 2
                
                # 在差異圖像區域（下方）繪製標示
                offset_y = height  # 差異圖像在下方
                
                # 繪製紅色矩形框
                rect_margin = 5
                draw.rectangle(
                    [(min_x - rect_margin, offset_y + min_y - rect_margin),
                     (max_x + rect_margin, offset_y + max_y + rect_margin)],
                    outline='red',
                    width=3
                )
                
                # 繪製紅色圓圈（標示中心點）
                circle_radius = 10
                draw.ellipse(
                    [(center_x - circle_radius, offset_y + center_y - circle_radius),
                     (center_x + circle_radius, offset_y + center_y + circle_radius)],
                    outline='red',
                    width=3
                )
        
        return composite
    
    def _calculate_diff_regions(self, diff_img: Image.Image) -> List[Dict[str, Any]]:
        """
        計算差異區域
        
        Args:
            diff_img: 差異圖像
            
        Returns:
            List[Dict[str, Any]]: 差異區域列表
        """
        diff_arr = np.array(diff_img)
        diff_mask = np.any(diff_arr == [255, 0, 0], axis=2)
        
        regions = []
        
        if np.any(diff_mask):
            y_coords, x_coords = np.where(diff_mask)
            
            if len(x_coords) > 0 and len(y_coords) > 0:
                min_x, max_x = int(np.min(x_coords)), int(np.max(x_coords))
                min_y, max_y = int(np.min(y_coords)), int(np.max(y_coords))
                center_x = (min_x + max_x) // 2
                center_y = (min_y + max_y) // 2
                
                regions.append({
                    "x": min_x,
                    "y": min_y,
                    "width": max_x - min_x,
                    "height": max_y - min_y,
                    "center_x": center_x,
                    "center_y": center_y
                })
        
        return regions

