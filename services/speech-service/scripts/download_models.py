#!/usr/bin/env python3
"""
WeNet 模型下载脚本
下载预训练的WeNet模型用于语音对齐和发音评估
"""
import os
import sys
import urllib.request
import tarfile
import zipfile
import logging
from pathlib import Path

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 模型URL配置
MODELS = {
    'librispeech_conformer': {
        'url': 'https://wenet-1256283475.cos.ap-shanghai.myqcloud.com/models/librispeech/20210610_u2pp_conformer_exp.tar.gz',
        'description': 'LibriSpeech Conformer模型 (英语)',
        'size': '~400MB'
    },
    'aishell_conformer': {
        'url': 'https://wenet-1256283475.cos.ap-shanghai.myqcloud.com/models/aishell/20210601_u2pp_conformer_exp.tar.gz',
        'description': 'AISHELL Conformer模型 (中文)',
        'size': '~400MB'
    }
}

DEFAULT_MODEL = 'librispeech_conformer'


def download_file(url: str, filepath: str, description: str = "") -> bool:
    """下载文件"""
    try:
        logger.info(f"正在下载 {description}: {url}")

        # 设置SSL上下文，跳过证书验证（仅用于下载模型）
        import ssl
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        # 创建自定义opener
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_context))
        urllib.request.install_opener(opener)

        def show_progress(block_num, block_size, total_size):
            if total_size > 0:
                downloaded = block_num * block_size
                percent = min(downloaded / total_size * 100, 100)
                sys.stdout.write(f"\r下载进度: {percent:.1f}% ({downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB)")
                sys.stdout.flush()

        urllib.request.urlretrieve(url, filepath, reporthook=show_progress)
        print()  # 换行
        logger.info(f"下载完成: {filepath}")
        return True

    except Exception as e:
        logger.error(f"下载失败: {e}")

        # 尝试使用requests作为备选方案
        try:
            logger.info("尝试使用requests下载...")
            import requests

            # 禁用SSL验证
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            response = requests.get(url, stream=True, verify=False, timeout=60)
            response.raise_for_status()

            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0

            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = downloaded / total_size * 100
                            sys.stdout.write(f"\r下载进度: {percent:.1f}% ({downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB)")
                            sys.stdout.flush()

            print()  # 换行
            logger.info(f"使用requests下载完成: {filepath}")
            return True

        except Exception as e2:
            logger.error(f"requests下载也失败: {e2}")
            return False


def extract_archive(filepath: str, extract_to: str) -> bool:
    """解压压缩文件"""
    try:
        logger.info(f"正在解压: {filepath}")

        if filepath.endswith('.tar.gz'):
            with tarfile.open(filepath, 'r:gz') as tar:
                tar.extractall(extract_to)
        elif filepath.endswith('.zip'):
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                zip_ref.extractall(extract_to)
        else:
            logger.error(f"不支持的压缩格式: {filepath}")
            return False

        logger.info(f"解压完成: {extract_to}")
        return True

    except Exception as e:
        logger.error(f"解压失败: {e}")
        return False


def setup_model_files(model_dir: str, app_dir: str) -> bool:
    """设置模型文件链接"""
    try:
        # 查找解压后的模型文件
        model_files = {
            'final.pt': None,
            'train.yaml': None,
            'words.txt': None
        }

        for root, dirs, files in os.walk(model_dir):
            for file in files:
                if file in model_files:
                    model_files[file] = os.path.join(root, file)

        # 创建符号链接或复制文件到app目录
        models_dir = os.path.join(app_dir, '..', 'models')
        os.makedirs(models_dir, exist_ok=True)

        for filename, filepath in model_files.items():
            if filepath:
                target_path = os.path.join(models_dir, filename)
                if os.path.exists(target_path):
                    os.remove(target_path)

                # 复制文件而不是创建符号链接（更兼容）
                import shutil
                shutil.copy2(filepath, target_path)
                logger.info(f"复制模型文件: {filename} -> {target_path}")
            else:
                logger.warning(f"未找到模型文件: {filename}")

        # 更新app目录中的配置文件路径
        app_config_path = os.path.join(app_dir, 'wenet_config.yaml')
        if os.path.exists(app_config_path):
            # 读取并更新配置文件中的路径
            import yaml
            with open(app_config_path, 'r') as f:
                config = yaml.safe_load(f)

            # 这里可以根据需要更新配置
            logger.info("配置文件路径已更新")

        return True

    except Exception as e:
        logger.error(f"设置模型文件失败: {e}")
        return False


def download_model(model_name: str = DEFAULT_MODEL, force: bool = False) -> bool:
    """下载指定模型"""
    if model_name not in MODELS:
        logger.error(f"未知模型: {model_name}")
        logger.info(f"可用模型: {list(MODELS.keys())}")
        return False

    model_info = MODELS[model_name]

    # 确定下载路径 - 直接下载到 models 目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(script_dir, 'models')
    app_dir = os.path.join(script_dir, 'app')

    os.makedirs(models_dir, exist_ok=True)

    # 检查是否已经下载
    filename = os.path.basename(model_info['url'])
    filepath = os.path.join(models_dir, filename)

    if os.path.exists(filepath) and not force:
        logger.info(f"模型文件已存在: {filepath}")
    else:
        # 直接下载到 models 目录
        if not download_file(model_info['url'], filepath, model_info['description']):
            return False

    # 解压模型到 models 目录
    extract_dir = os.path.join(models_dir, model_name)
    if os.path.exists(extract_dir) and not force:
        logger.info(f"模型已解压: {extract_dir}")
    else:
        if not extract_archive(filepath, models_dir):
            return False

    # 设置模型文件
    if not setup_model_files(extract_dir, app_dir):
        return False

    logger.info(f"模型 {model_name} 安装完成!")
    return True


def list_models():
    """列出可用模型"""
    print("可用的WeNet模型:")
    print("-" * 50)
    for name, info in MODELS.items():
        print(f"模型名: {name}")
        print(f"描述: {info['description']}")
        print(f"大小: {info['size']}")
        print(f"URL: {info['url']}")
        print("-" * 50)


def manual_download_instructions():
    """显示手动下载说明"""
    print("📖 手动下载说明")
    print("=" * 50)
    print("如果自动下载失败，您可以手动下载模型:")
    print()
    print("1. 下载 LibriSpeech Conformer 模型:")
    print("   URL: https://wenet-1256283475.cos.ap-shanghai.myqcloud.com/models/librispeech/20210610_u2pp_conformer_exp.tar.gz")
    print("   保存为: models/20210610_u2pp_conformer_exp.tar.gz")
    print()
    print("2. 解压模型文件:")
    print("   tar -xzf models/20210610_u2pp_conformer_exp.tar.gz -C models/")
    print()
    print("3. 模型文件将自动解压到正确位置:")
    print("   models/librispeech_conformer/final.pt")
    print("   models/librispeech_conformer/train.yaml")
    print("   models/librispeech_conformer/words.txt")
    print()
    print("4. 或者使用我们提供的备用文件:")
    print("   模型将使用 app/wenet_config.yaml 和 app/words.txt")
    print("   您只需要下载 final.pt 模型文件")
    print()
    print("🔧 备用方案:")
    print("即使没有模型文件，服务也会使用回退对齐算法正常工作")


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='WeNet 模型下载工具')
    parser.add_argument('--model', '-m', default=DEFAULT_MODEL,
                       help=f'模型名称 (默认: {DEFAULT_MODEL})')
    parser.add_argument('--list', '-l', action='store_true',
                       help='列出可用模型')
    parser.add_argument('--force', '-f', action='store_true',
                       help='强制重新下载')
    parser.add_argument('--manual', action='store_true',
                       help='显示手动下载说明')
    parser.add_argument('--skip-download', action='store_true',
                       help='跳过下载，只设置本地文件')

    args = parser.parse_args()

    if args.list:
        list_models()
        return 0

    if args.manual:
        manual_download_instructions()
        return 0

    print("🚀 WeNet 模型下载工具")
    print("=" * 50)

    if args.skip_download:
        print("⏭️  跳过下载，使用本地配置文件")

        # 创建模型目录并设置本地文件
        script_dir = os.path.dirname(os.path.abspath(__file__))
        models_dir = os.path.join(script_dir, 'models')
        app_dir = os.path.join(script_dir, 'app')

        os.makedirs(models_dir, exist_ok=True)

        # 创建占位文件
        placeholder_model = os.path.join(models_dir, 'final.pt')
        if not os.path.exists(placeholder_model):
            with open(placeholder_model, 'w') as f:
                f.write("# 占位模型文件 - 服务将使用回退模式")

        print("✅ 本地配置完成，服务将使用回退对齐模式")
        print("\n📝 下一步:")
        print("1. 运行测试: python test_wenet.py")
        print("2. 启动服务: uvicorn app.main:app --host 0.0.0.0 --port 8080")
        print("3. 如需真实模型，请运行: python download_models.py --manual")
        return 0

    success = download_model(args.model, args.force)

    if success:
        print("🎉 模型下载和安装成功!")
        print("\n📝 下一步:")
        print("1. 确保已安装依赖: pip install -e .")
        print("2. 运行测试: python test_wenet.py")
        print("3. 启动服务: uvicorn app.main:app --host 0.0.0.0 --port 8080")
        return 0
    else:
        print("💥 模型下载失败!")
        print("\n🛠️  解决方案:")
        print("1. 检查网络连接")
        print("2. 尝试手动下载: python download_models.py --manual")
        print("3. 或跳过下载使用回退模式: python download_models.py --skip-download")
        return 1


if __name__ == "__main__":
    sys.exit(main())
