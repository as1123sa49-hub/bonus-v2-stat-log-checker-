"""測試報告生成器模組"""
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path


class ReportGenerator:
    """測試報告生成器"""
    
    def __init__(self, reports_dir: str = "reports"):
        """
        初始化報告生成器
        
        Args:
            reports_dir: 報告輸出目錄
        """
        self.reports_dir = reports_dir
        os.makedirs(reports_dir, exist_ok=True)
    
    def generate_html_report(
        self,
        test_results: List[Dict[str, Any]],
        output_path: Optional[str] = None
    ) -> str:
        """
        生成 HTML 測試報告
        
        Args:
            test_results: 測試結果列表
            output_path: 輸出檔案路徑，如果為 None 則自動生成
            
        Returns:
            str: 報告檔案路徑
        """
        if output_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(self.reports_dir, f"report_{timestamp}.html")
        
        html_content = self._generate_html_content(test_results)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        return output_path
    
    def generate_text_report(
        self,
        test_results: List[Dict[str, Any]],
        output_path: Optional[str] = None
    ) -> str:
        """
        生成文字測試報告
        
        Args:
            test_results: 測試結果列表
            output_path: 輸出檔案路徑，如果為 None 則自動生成
            
        Returns:
            str: 報告檔案路徑
        """
        if output_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(self.reports_dir, f"report_{timestamp}.txt")
        
        text_content = self._generate_text_content(test_results)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
        
        return output_path
    
    def generate_json_report(
        self,
        test_results: List[Dict[str, Any]],
        output_path: Optional[str] = None
    ) -> str:
        """
        生成 JSON 測試報告（供 CI/CD 整合）
        
        Args:
            test_results: 測試結果列表
            output_path: 輸出檔案路徑，如果為 None 則自動生成
            
        Returns:
            str: 報告檔案路徑
        """
        if output_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(self.reports_dir, f"report_{timestamp}.json")
        
        report_data = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": len(test_results),
            "passed": sum(1 for r in test_results if r.get("passed")),
            "failed": sum(1 for r in test_results if not r.get("passed")),
            "results": test_results
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, ensure_ascii=False, indent=2)
        
        return output_path
    
    def _generate_html_content(self, test_results: List[Dict[str, Any]]) -> str:
        """生成 HTML 內容"""
        passed_count = sum(1 for r in test_results if r.get("passed"))
        failed_count = len(test_results) - passed_count
        
        html = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI 比對測試報告</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }}
        .header {{
            background-color: #333;
            color: white;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
        }}
        .summary {{
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
        }}
        .summary-item {{
            background-color: white;
            padding: 15px;
            border-radius: 5px;
            flex: 1;
        }}
        .summary-item.passed {{
            border-left: 5px solid #4CAF50;
        }}
        .summary-item.failed {{
            border-left: 5px solid #f44336;
        }}
        .test-result {{
            background-color: white;
            padding: 20px;
            margin-bottom: 15px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .test-result.passed {{
            border-left: 5px solid #4CAF50;
        }}
        .test-result.failed {{
            border-left: 5px solid #f44336;
        }}
        .test-name {{
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
        }}
        .test-details {{
            margin-top: 10px;
        }}
        .screenshot {{
            margin-top: 10px;
            max-width: 100%;
        }}
        .screenshot img {{
            max-width: 800px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }}
        .diff-info {{
            background-color: #fff3cd;
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>UI 比對測試報告</h1>
        <p>生成時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>
    
    <div class="summary">
        <div class="summary-item">
            <h3>總測試數</h3>
            <p style="font-size: 24px; font-weight: bold;">{len(test_results)}</p>
        </div>
        <div class="summary-item passed">
            <h3>通過</h3>
            <p style="font-size: 24px; font-weight: bold; color: #4CAF50;">{passed_count}</p>
        </div>
        <div class="summary-item failed">
            <h3>失敗</h3>
            <p style="font-size: 24px; font-weight: bold; color: #f44336;">{failed_count}</p>
        </div>
    </div>
    
    <div class="test-results">
"""
        
        for result in test_results:
            status_class = "passed" if result.get("passed") else "failed"
            status_text = "✅ 通過" if result.get("passed") else "❌ 失敗"
            
            html += f"""
        <div class="test-result {status_class}">
            <div class="test-name">{result.get('test_name', 'Unknown')} - {status_text}</div>
            <div class="test-details">
                <p><strong>預期內容:</strong> {result.get('expected', 'N/A')}</p>
"""
            
            if not result.get("passed") and result.get("diff_info"):
                diff_info = result["diff_info"]
                html += f"""
                <div class="diff-info">
                    <p><strong>差異比例:</strong> {diff_info.get('diff_ratio', 0):.2%}</p>
                    <p><strong>差異像素數:</strong> {diff_info.get('diff_count', 0)}</p>
                    <p><strong>實際差異:</strong> {result.get('actual_diff', 'N/A')}</p>
                </div>
"""
            
            if result.get("diff_output_path"):
                diff_path = result["diff_output_path"]
                # 轉換為相對路徑
                if os.path.isabs(diff_path):
                    diff_path = os.path.relpath(diff_path, self.reports_dir)
                
                html += f"""
                <div class="screenshot">
                    <h4>差異截圖:</h4>
                    <img src="{diff_path}" alt="差異截圖">
                </div>
"""
            
            html += """
            </div>
        </div>
"""
        
        html += """
    </div>
</body>
</html>
"""
        
        return html
    
    def _generate_text_content(self, test_results: List[Dict[str, Any]]) -> str:
        """生成文字內容"""
        passed_count = sum(1 for r in test_results if r.get("passed"))
        failed_count = len(test_results) - passed_count
        
        text = f"""
UI 比對測試報告
{'=' * 60}
生成時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

測試摘要:
  總測試數: {len(test_results)}
  通過: {passed_count}
  失敗: {failed_count}

{'=' * 60}

"""
        
        for i, result in enumerate(test_results, 1):
            status = "✅ 通過" if result.get("passed") else "❌ 失敗"
            
            text += f"""
測試 {i}: {result.get('test_name', 'Unknown')} - {status}
預期內容: {result.get('expected', 'N/A')}
"""
            
            if not result.get("passed"):
                if result.get("diff_info"):
                    diff_info = result["diff_info"]
                    text += f"""
差異資訊:
  差異比例: {diff_info.get('diff_ratio', 0):.2%}
  差異像素數: {diff_info.get('diff_count', 0)}
  實際差異: {result.get('actual_diff', 'N/A')}
"""
                
                if result.get("diff_output_path"):
                    text += f"差異截圖路徑: {result['diff_output_path']}\n"
            
            text += "\n" + "-" * 60 + "\n"
        
        return text

