#!/usr/bin/env python3
"""
对齐模块

统一处理 MFA 批量对齐逻辑
"""

import os
import sys
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Optional

import soundfile as sf
from tqdm import tqdm
from praatio import textgrid as tg

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from config import alignment_config, ALIGNED_DATA_DIR
from utils import (
    load_speech_ocean_dataset,
    save_alignment_data,
    Timer,
    ProgressTracker,
    print_section,
    print_alignment_sample
)


class MFABatchAligner:
    """
    MFA 批量对齐器

    使用 MFA 的批处理模式进行音素对齐
    """

    def __init__(
        self,
        acoustic_model: str = None,
        dictionary: str = None,
        timeout: int = None
    ):
        """
        初始化对齐器

        Args:
            acoustic_model: MFA 声学模型
            dictionary: MFA 词典
            timeout: 超时时间（秒）
        """
        self.acoustic_model = acoustic_model or alignment_config.acoustic_model
        self.dictionary = dictionary or alignment_config.dictionary
        self.timeout = timeout or alignment_config.timeout

    def prepare_corpus(self, dataset, corpus_dir: str):
        """
        准备 MFA 语料目录

        MFA 需要的格式:
        corpus/
          sample_00000.wav
          sample_00000.txt
          sample_00001.wav
          sample_00001.txt
          ...

        Args:
            dataset: HuggingFace Dataset
            corpus_dir: 语料目录路径
        """
        os.makedirs(corpus_dir, exist_ok=True)

        print(f"📝 准备 MFA 语料...")

        for idx, item in enumerate(tqdm(dataset, desc="准备文件", ncols=80)):
            # 保存音频
            audio = item['audio']['array']
            sr = item['audio']['sampling_rate']
            text = item['text']

            audio_path = os.path.join(corpus_dir, f"sample_{idx:05d}.wav")
            text_path = os.path.join(corpus_dir, f"sample_{idx:05d}.txt")

            sf.write(audio_path, audio, sr)

            with open(text_path, 'w', encoding='utf-8') as f:
                f.write(text)

        print(f"✅ 准备完成: {len(dataset)} 个文件")

    def run_alignment(self, corpus_dir: str, output_dir: str) -> bool:
        """
        运行 MFA 批量对齐

        Args:
            corpus_dir: 语料目录
            output_dir: 输出目录

        Returns:
            success: 是否成功
        """
        print(f"🚀 开始批量对齐...")
        print(f"   输入目录: {corpus_dir}")
        print(f"   输出目录: {output_dir}")
        print()

        # 构建 MFA 命令
        cmd = [
            sys.executable,
            "-m", "montreal_forced_aligner.command_line.mfa",
            "align",
            "--single_speaker",
            "--clean",
            "--overwrite",
            corpus_dir,
            self.dictionary,
            self.acoustic_model,
            output_dir
        ]

        print(f"执行命令: {' '.join(cmd[:6])} ...")
        print()

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                env=os.environ.copy()
            )

            if result.returncode != 0:
                print(f"❌ MFA 批量对齐失败:")
                print(result.stderr[-1000:])
                return False

            print("✅ MFA 批量对齐完成！")
            return True

        except subprocess.TimeoutExpired:
            print(f"❌ MFA 批量对齐超时（{self.timeout}秒）")
            return False
        except Exception as e:
            print(f"❌ MFA 批量对齐失败: {e}")
            return False

    def parse_results(
        self,
        output_dir: str,
        dataset
    ) -> List[Dict]:
        """
        解析 MFA 输出的 TextGrid 文件

        Args:
            output_dir: MFA 输出目录
            dataset: 原始数据集

        Returns:
            aligned_results: 对齐结果列表
        """
        print(f"📊 解析对齐结果...")

        aligned_results = []

        for idx, item in enumerate(tqdm(dataset, desc="解析 TextGrid", ncols=80)):
            textgrid_path = os.path.join(output_dir, f"sample_{idx:05d}.TextGrid")

            if not os.path.exists(textgrid_path):
                tqdm.write(f"  ⚠️ 样本 {idx} 的 TextGrid 不存在")
                continue

            try:
                # 解析 TextGrid
                tg_obj = tg.openTextgrid(textgrid_path, includeEmptyIntervals=False)

                # 解析音素层
                phone_tier = tg_obj.getTier('phones')
                phonemes = []

                for entry in phone_tier.entries:
                    # 过滤空白和特殊标记
                    if entry.label and entry.label not in ['', 'sp', 'sil', 'spn']:
                        phonemes.append({
                            'phoneme': entry.label,
                            'start_time': entry.start,
                            'end_time': entry.end,
                            'duration': entry.end - entry.start
                        })

                aligned_results.append({
                    'index': idx,
                    'text': item['text'],
                    'audio_duration': len(item['audio']['array']) / item['audio']['sampling_rate'],
                    'phonemes': phonemes,
                    'words': item.get('words', [])
                })

            except Exception as e:
                tqdm.write(f"  ⚠️ 样本 {idx} 解析失败: {e}")

        return aligned_results

    def align(
        self,
        dataset,
        output_file: str
    ) -> bool:
        """
        执行完整的对齐流程

        Args:
            dataset: HuggingFace Dataset
            output_file: 输出文件路径

        Returns:
            success: 是否成功
        """
        # 创建临时目录
        temp_dir = tempfile.mkdtemp(prefix="mfa_batch_")
        corpus_dir = os.path.join(temp_dir, "corpus")
        mfa_output_dir = os.path.join(temp_dir, "output")

        try:
            timer = Timer()
            timer.start()

            # 1. 准备语料
            self.prepare_corpus(dataset, corpus_dir)

            # 2. 批量对齐
            print()
            success = self.run_alignment(corpus_dir, mfa_output_dir)
            if not success:
                return False

            # 3. 解析结果
            print()
            aligned_results = self.parse_results(mfa_output_dir, dataset)

            elapsed = timer.stop()

            # 4. 保存结果
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            save_alignment_data(aligned_results, output_file)

            # 5. 打印统计
            self._print_statistics(
                len(dataset),
                len(aligned_results),
                elapsed
            )

            # 6. 显示示例
            if aligned_results:
                print_section("📝 对齐示例")
                print_alignment_sample(aligned_results[0])

            print()
            print("✅ 批量对齐完成！")

            return True

        finally:
            # 清理临时文件
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _print_statistics(self, total: int, success: int, elapsed: float):
        """打印统计信息"""
        print()
        print("=" * 60)
        print("📊 对齐统计")
        print("=" * 60)
        print(f"总样本数: {total}")
        print(f"成功对齐: {success}")
        print(f"成功率: {success / total * 100:.1f}%")
        print()
        print(f"总耗时: {elapsed:.1f} 秒 ({elapsed / 60:.1f} 分钟)")
        print(f"平均每样本: {elapsed / total:.2f} 秒")
        print()


def batch_align_dataset(
    split: str = 'train',
    max_samples: Optional[int] = None,
    output_dir: str = None
) -> bool:
    """
    批量对齐数据集（主函数）

    Args:
        split: 'train' 或 'test'
        max_samples: 最大样本数（None = 全部）
        output_dir: 输出目录（相对于项目根目录）

    Returns:
        success: 是否成功
    """
    print_section(f"🎯 批量对齐 SpeechOcean762 数据集 ({split})")
    print()

    # 1. 加载数据集
    dataset = load_speech_ocean_dataset(split, max_samples)
    print()

    # 2. 创建对齐器
    aligner = MFABatchAligner()

    # 3. 设置输出路径
    if output_dir is None:
        output_dir = str(ALIGNED_DATA_DIR)
    elif not os.path.isabs(output_dir):
        # 相对路径，相对于 speech-service/ 根目录
        base_dir = Path(__file__).parent.parent
        output_dir = str(base_dir / output_dir)

    output_file = os.path.join(output_dir, f"{split}_aligned.json")

    # 4. 执行对齐
    return aligner.align(dataset, output_file)


def check_and_align_data(
    split: str,
    num_samples: Optional[int],
    alignment_file: str,
    output_dir: str = 'aligned_data',
    min_success_rate: float = None
) -> bool:
    """
    检查对齐数据，如果不足则自动对齐（支持容错）

    Args:
        split: 'train' 或 'test'
        num_samples: 需要的样本数量（None = 全部数据）
        alignment_file: 对齐文件路径
        output_dir: 对齐数据输出目录
        min_success_rate: 最低成功率阈值（None = 使用配置默认值 80%）

    Returns:
        success: 是否有足够的对齐数据
    """
    # 使用配置中的默认值
    if min_success_rate is None:
        min_success_rate = alignment_config.min_success_rate

    # 如果 num_samples 为 None，获取数据集的实际大小
    if num_samples is None:
        print(f"📊 正在加载数据集以获取实际样本数...")
        dataset = load_speech_ocean_dataset(split, max_samples=None)
        num_samples = len(dataset)
        print(f"✅ 数据集共有 {num_samples} 个样本")

    # 检查对齐文件是否存在
    if not os.path.exists(alignment_file):
        print(f"\n⚠️ 未找到对齐数据: {alignment_file}")
        print(f"🚀 开始对齐 {num_samples} 个样本...")
        print()

        # 自动对齐
        success = batch_align_dataset(
            split=split,
            max_samples=num_samples,
            output_dir=output_dir
        )

        if not success:
            print("❌ 自动对齐失败")
            return False

        print()
        return True

    # 检查对齐数据数量和成功率
    with open(alignment_file, 'r') as f:
        aligned_data = json.load(f)

    num_aligned = len(aligned_data)
    success_rate = num_aligned / num_samples if num_samples > 0 else 0
    missing_count = num_samples - num_aligned

    print(f"✅ 找到对齐数据: {num_aligned}/{num_samples} 个样本")
    print(f"   对齐成功率: {success_rate*100:.1f}%")

    # ⭐ 关键改进：允许一定的对齐失败率
    if success_rate >= min_success_rate:
        # 成功率足够，不需要重新对齐
        if missing_count > 0:
            print(f"   💡 有 {missing_count} 个样本未对齐（成功率 >= {min_success_rate*100:.0f}%）")
            print(f"   💡 这是正常的，训练时会使用平均分配模式处理这些样本")
        else:
            print(f"   ✅ 所有样本都已对齐")
        return True

    # 成功率太低，需要重新对齐
    print(f"   ⚠️ 对齐成功率过低（< {min_success_rate*100:.0f}%），需要重新对齐")
    print(f"   🚀 开始重新对齐...")
    print()

    # 对齐更多数据
    success = batch_align_dataset(
        split=split,
        max_samples=num_samples,
        output_dir=output_dir
    )

    if not success:
        print("❌ 自动对齐失败")
        return False

    print()
    return True

