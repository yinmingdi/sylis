#!/usr/bin/env python3
"""
批量对齐 SpeechOcean762 数据集（优化版）

使用 MFA 的批处理模式，速度提升 5-10 倍
"""

import os
import sys
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from tqdm import tqdm

os.environ['PYTHONWARNINGS'] = 'ignore'
import warnings
warnings.filterwarnings('ignore')

from datasets import load_dataset
import soundfile as sf


def batch_align_mfa(audio_dir, output_dir, acoustic_model='english_us_arpa', dictionary='english_us_arpa'):
    """
    使用 MFA 批量对齐（快得多！）

    Args:
        audio_dir: 包含音频和文本文件的目录
        output_dir: 输出目录
        acoustic_model: MFA 声学模型
        dictionary: MFA 词典
    """
    print(f"🚀 开始批量对齐...")
    print(f"   输入目录: {audio_dir}")
    print(f"   输出目录: {output_dir}")
    print()

    # 使用 MFA 命令行批量对齐
    cmd = [
        sys.executable,
        "-m", "montreal_forced_aligner.command_line.mfa",
        "align",
        "--single_speaker",
        "--clean",
        "--overwrite",
        audio_dir,
        dictionary,
        acoustic_model,
        output_dir
    ]

    print(f"执行命令: {' '.join(cmd[:6])} ...")
    print()

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,  # 1小时超时
            env=os.environ.copy()
        )

        if result.returncode != 0:
            print(f"❌ MFA 批量对齐失败:")
            print(result.stderr[-1000:])
            return False

        print("✅ MFA 批量对齐完成！")
        return True

    except subprocess.TimeoutExpired:
        print("❌ MFA 批量对齐超时（1小时）")
        return False
    except Exception as e:
        print(f"❌ MFA 批量对齐失败: {e}")
        return False


def prepare_mfa_corpus(dataset, corpus_dir):
    """
    准备 MFA 语料目录

    MFA 需要的格式:
    corpus/
      file1.wav
      file1.txt
      file2.wav
      file2.txt
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


def parse_textgrid_results(output_dir, dataset):
    """
    解析 MFA 输出的 TextGrid 文件
    """
    from praatio import textgrid as tg

    print(f"📊 解析对齐结果...")

    aligned_results = []

    for idx, item in enumerate(tqdm(dataset, desc="解析 TextGrid", ncols=80)):
        textgrid_path = os.path.join(output_dir, f"sample_{idx:05d}.TextGrid")

        if not os.path.exists(textgrid_path):
            continue

        try:
            tg_obj = tg.openTextgrid(textgrid_path, includeEmptyIntervals=False)

            # 解析音素层
            phone_tier = tg_obj.getTier('phones')
            phonemes = []

            for entry in phone_tier.entries:
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


def batch_align_dataset(split='train', max_samples=10, output_dir='aligned_data'):
    """
    批量对齐数据集（优化版）

    注意：output_dir 相对于项目根目录（speech-service/）
    如果从 training/ 目录调用，会自动保存到 ../aligned_data/
    """
    print("=" * 60)
    print(f"🎯 批量对齐 SpeechOcean762 数据集 ({split})")
    print("=" * 60)
    print()

    # 1. 加载数据集
    print(f"📦 加载数据集...")
    if max_samples:
        dataset = load_dataset("mispeech/speechocean762", split=f"{split}[:{max_samples}]")
    else:
        dataset = load_dataset("mispeech/speechocean762", split=split)

    print(f"✅ 加载了 {len(dataset)} 个样本")
    print()

    # 2. 创建临时目录
    temp_dir = tempfile.mkdtemp(prefix="mfa_batch_")
    corpus_dir = os.path.join(temp_dir, "corpus")
    mfa_output_dir = os.path.join(temp_dir, "output")

    try:
        # 3. 准备 MFA 语料
        import time
        start_time = time.time()

        prepare_mfa_corpus(dataset, corpus_dir)

        # 4. 批量对齐
        print()
        if not batch_align_mfa(corpus_dir, mfa_output_dir):
            return False

        # 5. 解析结果
        print()
        aligned_results = parse_textgrid_results(mfa_output_dir, dataset)

        align_time = time.time() - start_time

        # 6. 保存结果
        # 如果是相对路径，相对于 speech-service/ 根目录
        if not os.path.isabs(output_dir):
            base_dir = Path(__file__).parent.parent
            output_dir = str(base_dir / output_dir)

        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, f"{split}_aligned.json")

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(aligned_results, f, indent=2, ensure_ascii=False)

        # 7. 统计
        print()
        print("=" * 60)
        print("📊 对齐统计")
        print("=" * 60)
        print(f"总样本数: {len(dataset)}")
        print(f"成功对齐: {len(aligned_results)}")
        print(f"成功率: {len(aligned_results) / len(dataset) * 100:.1f}%")
        print()
        print(f"总耗时: {align_time:.1f} 秒 ({align_time / 60:.1f} 分钟)")
        print(f"平均每样本: {align_time / len(dataset):.2f} 秒")
        print(f"💾 结果保存: {output_file}")
        print()

        # 8. 显示示例
        if aligned_results:
            sample = aligned_results[0]
            print("=" * 60)
            print("📝 对齐示例")
            print("=" * 60)
            print(f"文本: {sample['text']}")
            print(f"音频时长: {sample['audio_duration']:.2f}秒")
            print(f"音素数量: {len(sample['phonemes'])}")
            print()
            print("前 10 个音素:")
            for p in sample['phonemes'][:10]:
                print(f"  {p['phoneme']:<6} {p['start_time']:.3f}s - {p['end_time']:.3f}s  (时长: {p['duration']:.3f}s)")

        print()
        print("✅ 批量对齐完成！")

        return True

    finally:
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='批量对齐 SpeechOcean762 数据集（优化版）')
    parser.add_argument('--split', default='train', choices=['train', 'test'])
    parser.add_argument('--max-samples', type=int, default=10,
                        help='对齐样本数（默认10个测试）')
    parser.add_argument('--output-dir', default='aligned_data')

    args = parser.parse_args()

    print()
    print("🚀 批量对齐模式（速度提升 5-10 倍）")
    print()
    print("💡 测试 10 个: python batch_align_dataset.py")
    print("💡 对齐 100 个: python batch_align_dataset.py --max-samples 100")
    print("💡 全部对齐: python batch_align_dataset.py --max-samples 0")
    print()

    max_samples = None if args.max_samples == 0 else args.max_samples

    batch_align_dataset(
        split=args.split,
        max_samples=max_samples,
        output_dir=args.output_dir
    )


if __name__ == "__main__":
    main()

