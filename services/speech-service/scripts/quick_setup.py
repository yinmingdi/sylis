#!/usr/bin/env python3
"""
Sylis WeNet 语音服务快速设置脚本
Quick setup script for Sylis WeNet Speech Service
"""
import os
import sys
import subprocess
import platform
import logging

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def run_command(cmd: str, description: str = "", check: bool = True) -> bool:
    """运行系统命令"""
    try:
        logger.info(f"执行: {description or cmd}")
        result = subprocess.run(cmd, shell=True, check=check,
                              capture_output=True, text=True, timeout=300)

        if result.stdout:
            print(result.stdout.strip())

        if result.stderr and result.returncode != 0:
            print(f"警告: {result.stderr.strip()}")

        return result.returncode == 0

    except subprocess.TimeoutExpired:
        logger.error(f"命令执行超时: {cmd}")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"命令执行失败: {e}")
        if e.stdout:
            print(f"输出: {e.stdout}")
        if e.stderr:
            print(f"错误: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"执行异常: {e}")
        return False


def check_python_version():
    """检查Python版本"""
    print("🐍 检查Python版本...")
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print(f"❌ Python版本过低: {version.major}.{version.minor}")
        print("需要Python 3.8或更高版本")
        return False

    print(f"✅ Python版本: {version.major}.{version.minor}.{version.micro}")
    return True


def install_dependencies():
    """安装Python依赖"""
    print("\n📦 安装Python依赖...")

    # 检查pyproject.toml是否存在
    if not os.path.exists("pyproject.toml"):
        print("❌ pyproject.toml 文件不存在")
        return False

    # 安装依赖
    success = run_command("pip3 install -e .", "安装项目依赖", timeout=600)

    if success:
        print("✅ 依赖安装完成")
    else:
        print("❌ 依赖安装失败，尝试备用方案...")
        # 安装基础依赖
        basic_deps = [
            "fastapi==0.115.0",
            "uvicorn[standard]==0.30.6",
            "python-multipart>=0.0.5",
            "torch>=1.13.0",
            "torchaudio>=0.13.0",
            "numpy>=1.21.0",
            "librosa>=0.9.0",
            "soundfile>=0.12.0",
            "scipy>=1.9.0",
            "requests>=2.28.0",
            "pyyaml>=6.0.0",
            "urllib3>=1.26.0",
            "g2p_en>=2.1.0"
        ]

        for dep in basic_deps:
            run_command(f"pip3 install '{dep}'", f"安装 {dep}", check=False)

        print("⚠️  WeNet可能安装失败，将使用回退模式")

    return True




def check_service():
    """检查服务文件"""
    print("\n🌐 检查服务文件...")

    files_to_check = [
        "app/main.py",
        "app/alignment.py",
        "app/phoneme_confidence.py",
        "config/wenet_config.yaml",
        "config/words.txt"
    ]

    all_good = True
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"❌ {file_path} 未找到")
            all_good = False

    return all_good


def show_next_steps():
    """显示后续步骤"""
    print("\n🎉 设置完成!")
    print("=" * 40)
    print("📝 下一步操作:")
    print()
    print("1. 启动服务:")
    print("   uvicorn app.main:app --host 0.0.0.0 --port 8080")
    print()
    print("2. 查看API文档:")
    print("   http://localhost:8080/docs")
    print()
    print("3. 测试API:")
    print("   curl http://localhost:8080/health")
    print()
    print("🔧 故障排除:")
    print("- 端口被占用: 检查8080端口")
    print("- 详细日志: uvicorn app.main:app --log-level debug")


def main():
    """主函数"""
    print("🚀 Sylis WeNet 语音服务快速设置")
    print("=" * 40)
    print("自动安装依赖")
    print()

    # 检查操作系统
    system = platform.system()
    print(f"🖥️  操作系统: {system}")

    try:
        # 1. 检查Python版本
        if not check_python_version():
            return 1

        # 2. 安装依赖
        if not install_dependencies():
            return 1

        # 3. 检查服务文件
        if not check_service():
            print("⚠️  部分文件缺失，但服务可能仍然可用")

        # 4. 显示后续步骤
        show_next_steps()

        return 0

    except KeyboardInterrupt:
        print("\n\n⏸️  设置被用户中断")
        return 1
    except Exception as e:
        print(f"\n\n💥 设置过程中出现错误: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
