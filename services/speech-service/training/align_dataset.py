#!/usr/bin/env python3
"""
对齐 SpeechOcean762 数据集

使用 MFA 对每个音频进行音素级对齐，保存结果供训练使用
"""

import os
import sys
import json
import time
import tempfile
import soundfile as sf
from pathlib import Path
from tqdm import tqdm

os.environ['PYTHONWARNINGS'] = 'ignore'
import warnings
warnings.filterwarnings('ignore')

from datasets import load_dataset

# 添加 app 到路径
sys.path.insert(0, str(Path(__file__).parent))
from app.mfa_aligner import create_mfa_aligner


def align_dataset(split='train', max_samples=10, output_dir='aligned_data'):
    """
    对齐数据集

    Args:
        split: 'train' 或 'test'
        max_samples: 最大对齐样本数（None = 全部）
        output_dir: 对齐结果保存目录
    """
    print("=" * 60)
    print(f"🎯 对齐 SpeechOcean762 数据集 ({split})")
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

    # 2. 初始化 MFA 对齐器
    print("🔧 初始化 MFA 对齐器...")
    aligner = create_mfa_aligner()
    if not aligner.initialize():
        print("❌ MFA 初始化失败")
        return False
    print("✅ MFA 对齐器就绪")
    print()

    # 3. 创建输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 4. 对齐每个样本
    print(f"🚀 开始对齐 {len(dataset)} 个样本...")
    print(f"💾 结果保存到: {output_dir}/")
    print()

    aligned_results = []
    success_count = 0
    fail_count = 0
    total_time = 0

    for idx, item in enumerate(tqdm(dataset, desc="对齐进度", ncols=80)):
        try:
            # 保存音频到临时文件
            audio = item['audio']['array']
            sr = item['audio']['sampling_rate']
            text = item['text']

            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                sf.write(f.name, audio, sr)
                temp_audio = f.name

            # 对齐
            start_time = time.time()
            alignment = aligner.align(temp_audio, text)
            align_time = time.time() - start_time
            total_time += align_time

            # 清理临时文件
            os.unlink(temp_audio)

            if alignment.success:
                # 保存对齐结果
                result = {
                    'index': idx,
                    'text': text,
                    'audio_duration': len(audio) / sr,
                    'alignment_time': align_time,
                    'phonemes': [
                        {
                            'phoneme': p.phoneme,
                            'start_time': p.start_time,
                            'end_time': p.end_time,
                            'duration': p.duration,
                            'word': p.word
                        }
                        for p in alignment.phonemes
                    ],
                    'words': item.get('words', [])  # 保存原始标注
                }

                aligned_results.append(result)
                success_count += 1
            else:
                fail_count += 1
                tqdm.write(f"  ⚠️ 样本 {idx} 对齐失败: {alignment.error_message}")

        except Exception as e:
            fail_count += 1
            tqdm.write(f"  ❌ 样本 {idx} 处理失败: {e}")

    # 5. 保存所有对齐结果
    output_file = f"{output_dir}/{split}_aligned.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(aligned_results, f, indent=2, ensure_ascii=False)

    # 6. 统计信息
    print()
    print("=" * 60)
    print("📊 对齐统计")
    print("=" * 60)
    print(f"总样本数: {len(dataset)}")
    print(f"成功: {success_count}")
    print(f"失败: {fail_count}")
    print(f"成功率: {success_count / len(dataset) * 100:.1f}%")
    print()
    print(f"总耗时: {total_time:.1f} 秒 ({total_time / 60:.1f} 分钟)")
    print(f"平均每样本: {total_time / len(dataset):.2f} 秒")
    print()
    print(f"💾 对齐结果已保存: {output_file}")
    print()

    # 7. 显示一个样本示例
    if aligned_results:
        print("=" * 60)
        print("📝 对齐示例（第一个样本）")
        print("=" * 60)
        sample = aligned_results[0]
        print(f"文本: {sample['text']}")
        print(f"音频时长: {sample['audio_duration']:.2f}秒")
        print(f"对齐耗时: {sample['alignment_time']:.2f}秒")
        print()
        print("音素对齐结果:")
        for p in sample['phonemes'][:10]:  # 只显示前10个
            print(f"  {p['phoneme']:<6} {p['start_time']:.3f}s - {p['end_time']:.3f}s  (时长: {p['duration']:.3f}s)  [{p['word']}]")
        if len(sample['phonemes']) > 10:
            print(f"  ... 还有 {len(sample['phonemes']) - 10} 个音素")

    print()
    print("✅ 对齐完成！")

    return True


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='对齐 SpeechOcean762 数据集')
    parser.add_argument('--split', default='train', choices=['train', 'test'],
                        help='数据集分割 (train/test)')
    parser.add_argument('--max-samples', type=int, default=1,
                        help='最大对齐样本数（默认1个测试速度）')
    parser.add_argument('--output-dir', default='aligned_data',
                        help='对齐结果保存目录')

    args = parser.parse_args()

    print()
    print("⚠️  注意：")
    print("   - 默认只对齐 1 个样本，测试速度")
    print("   - 确认速度可接受后，可用 --max-samples 参数增加样本数")
    print("   - 全部对齐约 2500 个样本，预计耗时较长")
    print()
    print("💡 快速测试：python align_dataset.py")
    print("💡 对齐更多：python align_dataset.py --max-samples 10")
    print()

    align_dataset(
        split=args.split,
        max_samples=args.max_samples,
        output_dir=args.output_dir
    )


if __name__ == "__main__":
    main()

