#!/usr/bin/env python3
"""
批量对齐 SpeechOcean762 数据集（重构版）

使用 MFA 的批处理模式，速度提升 5-10 倍

重构说明：
- 使用 aligner 模块统一对齐逻辑
- 使用 config 模块管理配置
- 使用 utils 模块提供通用工具
"""

import sys
from pathlib import Path
import argparse

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from config import setup_environment, alignment_config
from aligner import batch_align_dataset


def main():
    """主函数"""
    # 设置环境
    setup_environment()

    # 解析参数
    parser = argparse.ArgumentParser(
        description='批量对齐 SpeechOcean762 数据集（优化版）'
    )
    parser.add_argument(
        '--split',
        default='train',
        choices=['train', 'test'],
        help='数据集分割 (train/test)'
    )
    parser.add_argument(
        '--max-samples',
        type=int,
        default=10,
        help='对齐样本数（默认10个测试）'
    )
    parser.add_argument(
        '--output-dir',
        default=None,
        help=f'输出目录（默认: {alignment_config.output_dir}）'
    )

    args = parser.parse_args()

    # 打印提示
    print()
    print("🚀 批量对齐模式（速度提升 5-10 倍）")
    print()
    print("💡 测试 10 个: python batch_align_dataset.py")
    print("💡 对齐 100 个: python batch_align_dataset.py --max-samples 100")
    print("💡 全部对齐: python batch_align_dataset.py --max-samples 0")
    print()

    # 处理参数
    max_samples = None if args.max_samples == 0 else args.max_samples
    output_dir = args.output_dir or alignment_config.output_dir

    # 执行对齐
    batch_align_dataset(
        split=args.split,
        max_samples=max_samples,
        output_dir=output_dir
    )


if __name__ == "__main__":
    main()
