#!/usr/bin/env python3
"""
Sylis Speech Service Management Script
语音服务管理脚本
"""
import sys
import os
import argparse
import subprocess
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def start_service(host: str = "0.0.0.0", port: int = 8080, reload: bool = False):
    """启动语音服务"""
    print(f"🚀 启动语音服务 - {host}:{port}")

    # 切换到项目根目录
    os.chdir(project_root)

    cmd = [
        "uvicorn", "app.main:app",
        "--host", host,
        "--port", str(port)
    ]

    if reload:
        cmd.append("--reload")

    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\n⏹️  服务已停止")
    except subprocess.CalledProcessError as e:
        print(f"❌ 启动失败: {e}")
        sys.exit(1)


def test_service():
    """测试语音服务"""
    print("🧪 运行服务测试...")

    # 切换到项目根目录
    os.chdir(project_root)

    try:
        # 运行基础测试
        subprocess.run([sys.executable, "-m", "pytest", "tests/", "-v"], check=True)
        print("✅ 测试通过")
    except subprocess.CalledProcessError as e:
        print(f"❌ 测试失败: {e}")
        sys.exit(1)


def setup_service():
    """设置语音服务"""
    print("⚙️  设置语音服务...")

    # 切换到项目根目录
    os.chdir(project_root)

    # 运行快速设置脚本
    subprocess.run([sys.executable, "scripts/quick_setup.py"])


def download_models():
    """下载模型文件"""
    print("📦 下载模型文件...")

    # 切换到项目根目录
    os.chdir(project_root)

    # 运行模型下载脚本
    subprocess.run([sys.executable, "scripts/download_models.py"])


def health_check():
    """健康检查"""
    import requests

    print("🏥 进行健康检查...")

    try:
        response = requests.get("http://localhost:8080/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print("✅ 服务运行正常")
            print(f"   状态: {data.get('status', 'unknown')}")
            print(f"   模型: {data.get('model', 'unknown')}")
            return True
        else:
            print(f"❌ 服务异常: HTTP {response.status_code}")
            return False
    except requests.RequestException as e:
        print(f"❌ 无法连接到服务: {e}")
        return False


def show_logs():
    """显示日志"""
    print("📋 显示服务日志...")
    # 这里可以添加日志查看功能
    print("日志功能待实现")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="Sylis Speech Service 管理脚本")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # start 命令
    start_parser = subparsers.add_parser("start", help="启动服务")
    start_parser.add_argument("--host", default="0.0.0.0", help="绑定主机 (默认: 0.0.0.0)")
    start_parser.add_argument("--port", type=int, default=8080, help="绑定端口 (默认: 8080)")
    start_parser.add_argument("--reload", action="store_true", help="启用自动重载")

    # test 命令
    subparsers.add_parser("test", help="运行测试")

    # setup 命令
    subparsers.add_parser("setup", help="设置服务")

    # download 命令
    subparsers.add_parser("download", help="下载模型")

    # health 命令
    subparsers.add_parser("health", help="健康检查")

    # logs 命令
    subparsers.add_parser("logs", help="显示日志")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    if args.command == "start":
        start_service(args.host, args.port, args.reload)
    elif args.command == "test":
        test_service()
    elif args.command == "setup":
        setup_service()
    elif args.command == "download":
        download_models()
    elif args.command == "health":
        health_check()
    elif args.command == "logs":
        show_logs()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

