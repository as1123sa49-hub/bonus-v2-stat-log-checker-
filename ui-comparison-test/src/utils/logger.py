"""日誌工具模組"""
import logging
import sys
from typing import Optional


class Logger:
    """簡單的日誌工具類別"""
    
    def __init__(self, name: str = "ui_comparison"):
        """
        初始化日誌器
        
        Args:
            name: 日誌器名稱
        """
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.DEBUG)
        
        # 如果已經有 handler，不要重複添加
        if not self.logger.handlers:
            # 控制台輸出
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.INFO)
            
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            console_handler.setFormatter(formatter)
            
            self.logger.addHandler(console_handler)
    
    def debug(self, message: str):
        """輸出 DEBUG 級別日誌"""
        self.logger.debug(message)
    
    def info(self, message: str):
        """輸出 INFO 級別日誌"""
        self.logger.info(message)
    
    def warning(self, message: str):
        """輸出 WARNING 級別日誌"""
        self.logger.warning(message)
    
    def error(self, message: str):
        """輸出 ERROR 級別日誌"""
        self.logger.error(message)
    
    def success(self, message: str):
        """輸出成功訊息（INFO 級別）"""
        self.logger.info(f"✅ {message}")


# 全域日誌器實例
logger = Logger()

