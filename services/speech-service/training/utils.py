#!/usr/bin/env python3
"""
训练工具模块

提供通用的工具函数
"""

import os
import sys
import json
import time
import tempfile
from pathlib import Path
from typing import Dict, List, Any, Optional
from tqdm import tqdm

import soundfile as sf
from datasets import load_dataset

# 添加当前目录到 Python 路径（用于直接运行脚本）
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    dataset_config,
    alignment_config,
    PHONE_TO_IDX,
    ARPABET_PHONEMES,
    DIFFICULT_PHONEMES
)


# ==================== 数据集工具 ====================

def load_speech_ocean_dataset(split: str = 'train', max_samples: Optional[int] = None):
    """
    加载 SpeechOcean762 数据集

    Args:
        split: 'train' 或 'test'
        max_samples: 最大样本数（None = 全部）

    Returns:
        dataset: HuggingFace Dataset 对象
    """
    print(f"📦 加载 SpeechOcean762 数据集 ({split})...")

    if max_samples:
        dataset = load_dataset(
            dataset_config.name,
            split=f"{split}[:{max_samples}]",
            trust_remote_code=True
        )
    else:
        dataset = load_dataset(
            dataset_config.name,
            split=split,
            trust_remote_code=True
        )

    print(f"✅ 数据集加载完成: {len(dataset)} 个样本")
    return dataset


# ==================== 音频工具 ====================

def save_audio_to_temp(audio: Any, sample_rate: int, suffix: str = '.wav') -> str:
    """
    保存音频到临时文件

    Args:
        audio: 音频数组
        sample_rate: 采样率
        suffix: 文件后缀

    Returns:
        temp_path: 临时文件路径
    """
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        sf.write(f.name, audio, sample_rate)
        return f.name


def cleanup_temp_file(file_path: str):
    """清理临时文件"""
    try:
        if os.path.exists(file_path):
            os.unlink(file_path)
    except Exception:
        pass


# ==================== 对齐数据工具 ====================

def load_alignment_data(alignment_file: str) -> Optional[Dict[int, Dict]]:
    """
    加载对齐数据

    Args:
        alignment_file: 对齐文件路径

    Returns:
        alignments: 对齐数据字典 {index: alignment_data}
    """
    if not os.path.exists(alignment_file):
        return None

    print(f"📍 加载 MFA 对齐数据: {alignment_file}")

    with open(alignment_file, 'r', encoding='utf-8') as f:
        alignment_list = json.load(f)

    # 转换为字典，以 index 为键
    alignments = {a['index']: a for a in alignment_list}

    print(f"✅ 加载了 {len(alignments)} 个对齐结果")
    return alignments


def save_alignment_data(alignments: List[Dict], output_file: str):
    """
    保存对齐数据

    Args:
        alignments: 对齐数据列表
        output_file: 输出文件路径
    """
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(alignments, f, indent=2, ensure_ascii=False)

    print(f"💾 对齐结果已保存: {output_file}")


# ==================== 音素工具 ====================

def get_phoneme_index(phoneme: str) -> int:
    """
    获取音素索引

    Args:
        phoneme: 音素名称（可能带重音标记）

    Returns:
        index: 音素索引
    """
    # 去除重音标记（0, 1, 2）
    base_phone = phoneme.rstrip('012').upper()
    return PHONE_TO_IDX.get(base_phone, PHONE_TO_IDX['SIL'])


def analyze_phoneme_distribution(alignment_file: str, split_name: str):
    """
    分析音素分布

    Args:
        alignment_file: 对齐文件路径
        split_name: 数据集名称（用于显示）
    """
    if not os.path.exists(alignment_file):
        return

    print(f"\n📊 分析 {split_name} 音素分布...")

    with open(alignment_file, 'r') as f:
        data = json.load(f)

    phoneme_counts = {}
    phoneme_durations = {}

    for item in data:
        for ph in item['phonemes']:
            p = ph['phoneme'].rstrip('012').upper()
            phoneme_counts[p] = phoneme_counts.get(p, 0) + 1
            duration = ph['end_time'] - ph['start_time']
            if p not in phoneme_durations:
                phoneme_durations[p] = []
            phoneme_durations[p].append(duration)

    # 统计总数
    total = sum(phoneme_counts.values())

    # 显示 Top 10 最常见音素
    print(f"\n   Top 10 最常见音素:")
    sorted_phonemes = sorted(phoneme_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    for phoneme, count in sorted_phonemes:
        percentage = 100 * count / total
        import numpy as np
        avg_dur = np.mean(phoneme_durations[phoneme])
        print(f"      {phoneme:3s}: {count:5d} ({percentage:4.1f}%)  平均时长: {avg_dur:.3f}s")

    # 显示难音素统计
    print(f"\n   难音素统计:")
    for phoneme in DIFFICULT_PHONEMES:
        if phoneme in phoneme_counts:
            count = phoneme_counts[phoneme]
            percentage = 100 * count / total
            import numpy as np
            avg_dur = np.mean(phoneme_durations[phoneme])
            print(f"      {phoneme:3s}: {count:5d} ({percentage:4.1f}%)  平均时长: {avg_dur:.3f}s")
        else:
            print(f"      {phoneme:3s}: 未出现")

    print(f"\n   总音素数: {total:,}")
    print(f"   音素种类: {len(phoneme_counts)}")


# ==================== 统计工具 ====================

class Timer:
    """简单的计时器"""

    def __init__(self):
        self.start_time = None
        self.elapsed = 0

    def start(self):
        """开始计时"""
        self.start_time = time.time()

    def stop(self) -> float:
        """停止计时并返回经过的时间（秒）"""
        if self.start_time is None:
            return 0
        self.elapsed = time.time() - self.start_time
        return self.elapsed

    def get_elapsed(self) -> float:
        """获取经过的时间（秒）"""
        if self.start_time is None:
            return self.elapsed
        return time.time() - self.start_time


class ProgressTracker:
    """进度跟踪器"""

    def __init__(self, total: int, desc: str = "Progress"):
        self.total = total
        self.desc = desc
        self.success = 0
        self.failed = 0
        self.timer = Timer()

    def start(self):
        """开始跟踪"""
        self.timer.start()

    def record_success(self):
        """记录成功"""
        self.success += 1

    def record_failure(self):
        """记录失败"""
        self.failed += 1

    def print_summary(self):
        """打印摘要"""
        elapsed = self.timer.get_elapsed()

        print("\n" + "=" * 60)
        print("📊 处理统计")
        print("=" * 60)
        print(f"总样本数: {self.total}")
        print(f"成功: {self.success}")
        print(f"失败: {self.failed}")
        if self.total > 0:
            print(f"成功率: {self.success / self.total * 100:.1f}%")
        print()
        print(f"总耗时: {elapsed:.1f} 秒 ({elapsed / 60:.1f} 分钟)")
        if self.total > 0:
            print(f"平均每样本: {elapsed / self.total:.2f} 秒")
        print()


# ==================== 显示工具 ====================

def print_section(title: str, width: int = 60):
    """打印分节标题"""
    print("\n" + "=" * width)
    print(title)
    print("=" * width)


def print_subsection(title: str, width: int = 60):
    """打印子标题"""
    print(f"\n{title}")
    print("-" * width)


def print_config(config: Any, title: str = "配置"):
    """打印配置信息"""
    print(f"\n{title}:")
    for key, value in vars(config).items():
        print(f"   {key}: {value}")


def print_alignment_sample(alignment: Dict, max_phonemes: int = 10):
    """
    打印对齐样本示例

    Args:
        alignment: 对齐数据
        max_phonemes: 最大显示音素数
    """
    print(f"文本: {alignment['text']}")
    print(f"音频时长: {alignment['audio_duration']:.2f}秒")
    if 'alignment_time' in alignment:
        print(f"对齐耗时: {alignment['alignment_time']:.2f}秒")
    print()
    print("音素对齐结果:")

    for p in alignment['phonemes'][:max_phonemes]:
        word = p.get('word', '')
        print(f"  {p['phoneme']:<6} {p['start_time']:.3f}s - {p['end_time']:.3f}s  "
              f"(时长: {p['duration']:.3f}s)  [{word}]")

    if len(alignment['phonemes']) > max_phonemes:
        print(f"  ... 还有 {len(alignment['phonemes']) - max_phonemes} 个音素")


# ==================== 模型工具 ====================

def save_model_config(config: Dict, output_path: Path):
    """
    保存模型配置

    Args:
        config: 配置字典
        output_path: 输出路径
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"✅ 配置已保存: {output_path}")


def count_parameters(model) -> int:
    """
    统计模型参数量

    Args:
        model: PyTorch 模型

    Returns:
        num_params: 参数数量
    """
    return sum(p.numel() for p in model.parameters())


def get_model_size_mb(model) -> float:
    """
    获取模型大小（MB）

    Args:
        model: PyTorch 模型

    Returns:
        size_mb: 模型大小（MB）
    """
    num_params = count_parameters(model)
    return num_params * 4 / 1024 / 1024  # 假设 float32


# ==================== 验证工具 ====================

def check_alignment_file(
    split: str,
    num_samples: Optional[int],
    alignment_file: str
) -> tuple[bool, int]:
    """
    检查对齐文件是否存在且充足

    Args:
        split: 数据集分割
        num_samples: 需要的样本数（None = 全部）
        alignment_file: 对齐文件路径

    Returns:
        (exists, count): (是否充足, 已有数量)
    """
    # 如果文件不存在
    if not os.path.exists(alignment_file):
        return False, 0

    # 加载对齐数据
    with open(alignment_file, 'r') as f:
        aligned_data = json.load(f)

    num_aligned = len(aligned_data)

    # 如果 num_samples 为 None，检查是否对齐了整个数据集
    if num_samples is None:
        # 需要加载数据集来获取实际大小
        dataset = load_speech_ocean_dataset(split, max_samples=None)
        num_samples = len(dataset)

    # 检查是否充足
    is_sufficient = num_aligned >= num_samples

    return is_sufficient, num_aligned

