#!/usr/bin/env python3
"""
服务启动脚本

解决Python路径问题，确保所有模块能正确导入。
"""

import sys
import os
from pathlib import Path

# 添加app目录到Python路径
current_dir = Path(__file__).parent
app_dir = current_dir / "app"
sys.path.insert(0, str(app_dir))

# 设置工作目录
os.chdir(current_dir)

if __name__ == "__main__":
    import uvicorn
    
    # 启动服务
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[str(app_dir)]
    )
