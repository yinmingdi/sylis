#!/usr/bin/env python3
"""
测试 PyTorch 音素评分模型

使用训练好的 PyTorch DNN 模型进行语音评分测试
"""

import sys
import os
import logging
from pathlib import Path

# 设置日志级别为 INFO，显示详细信息
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:%(name)s:%(message)s'
)

# 添加 app 到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.pytorch_phoneme_scorer import create_pytorch_phoneme_scorer
from app.mfa_aligner import create_mfa_aligner


def test_pytorch_model(audio_path: str, text: str):
    """
    测试 PyTorch 模型

    Args:
        audio_path: 音频文件路径
        text: 参考文本
    """
    print("=" * 60)
    print("🎯 测试 PyTorch 音素评分模型")
    print("=" * 60)
    print()

    print(f"📁 音频文件: {audio_path}")
    print(f"📝 参考文本: {text}")
    print()

    # 1. 创建 MFA 对齐器
    print("📊 Step 1/3: 音素对齐 (MFA)")
    print("-" * 60)

    aligner = create_mfa_aligner()
    if not aligner.initialize():
        print("❌ MFA 对齐器初始化失败")
        return False

    alignment = aligner.align(audio_path, text)

    if not alignment.success:
        print(f"❌ 对齐失败: {alignment.error_message}")
        return False

    print(f"✅ 对齐成功")
    print(f"   单词数: {len(alignment.words)}")
    print(f"   音素数: {len(alignment.phonemes)}")
    print()

    # 2. 创建 PyTorch 评分器
    print("🧠 Step 2/3: 加载 PyTorch 模型")
    print("-" * 60)

    scorer = create_pytorch_phoneme_scorer()
    if not scorer.initialize():
        print("❌ PyTorch 评分器初始化失败")
        return False

    print("✅ PyTorch 模型加载成功")
    print()

    # 3. 评分
    print("💯 Step 3/3: 音素评分")
    print("-" * 60)

    scores = scorer.score_phonemes(
        audio_path=audio_path,
        sample_rate=16000,
        alignment=alignment
    )

    if not scores:
        print("❌ 评分失败")
        return False

    print(f"✅ 评分完成")
    print()

    # 4. 显示结果（简洁版）
    print("=" * 60)
    print("📊 评分结果")
    print("=" * 60)
    print()

    print(f"{'音素':<8} {'分数':<8} {'置信度':<8} {'GOP':<10} {'时长':<8} {'单词':<10}")
    print("-" * 60)

    # 难音素标记
    difficult_phonemes = {'L', 'R', 'OW', 'AW', 'TH', 'DH', 'V', 'W'}

    for score in scores:
        phoneme_base = score.phoneme.rstrip('012').upper()
        marker = " ⚠️" if phoneme_base in difficult_phonemes else ""

        print(
            f"{score.phoneme:<8} "
            f"{score.score:<8.1f} "
            f"{score.confidence:<8.3f} "
            f"{score.gop_score:<10.3f} "
            f"{score.end_time - score.start_time:<8.3f} "
            f"{score.word:<10}"
            f"{marker}"
        )

    # 5. 详细分析
    print()
    print("=" * 60)
    print("🔍 详细分析")
    print("=" * 60)
    print()

    # 显示每个音素的详细信息
    for i, score in enumerate(scores):
        phoneme_base = score.phoneme.rstrip('012').upper()
        is_difficult = phoneme_base in difficult_phonemes

        print(f"音素 {i+1}/{len(scores)}: {score.phoneme} ({score.word})")
        print(f"  ├─ 时间: {score.start_time:.3f}s - {score.end_time:.3f}s (时长: {score.end_time - score.start_time:.3f}s)")
        print(f"  ├─ 目标音素概率: {score.target_prob:.4f}")
        print(f"  ├─ 混淆音素概率: {score.confusion_prob:.4f}")
        print(f"  ├─ GOP 分数: {score.gop_score:.3f} (= log({score.target_prob:.4f}/{score.confusion_prob:.4f}))")
        print(f"  ├─ 置信度: {score.confidence:.3f}")
        print(f"  ├─ 时长得分: {score.duration_score:.1f}")
        print(f"  └─ 最终分数: {score.score:.1f}/100")

        if is_difficult:
            print(f"     ⚠️  难音素！建议重点练习")

        # 根据分数给出评价
        if score.score >= 80:
            print(f"     ✅ 优秀！")
        elif score.score >= 60:
            print(f"     🆗 良好")
        elif score.score >= 40:
            print(f"     ⚠️  需要改进")
        else:
            print(f"     ❌ 需要大量练习")

        print()

    # 6. 整体统计
    print("=" * 60)
    print("📈 整体统计")
    print("=" * 60)
    print()

    avg_score = sum(s.score for s in scores) / len(scores)
    avg_confidence = sum(s.confidence for s in scores) / len(scores)
    avg_gop = sum(s.gop_score for s in scores) / len(scores)

    # 难音素统计
    difficult_scores = [s for s in scores if s.phoneme.rstrip('012').upper() in difficult_phonemes]
    if difficult_scores:
        avg_difficult_score = sum(s.score for s in difficult_scores) / len(difficult_scores)
        print(f"难音素平均分: {avg_difficult_score:.1f} ({len(difficult_scores)} 个)")

    # 其他音素
    easy_scores = [s for s in scores if s.phoneme.rstrip('012').upper() not in difficult_phonemes]
    if easy_scores:
        avg_easy_score = sum(s.score for s in easy_scores) / len(easy_scores)
        print(f"其他音素平均分: {avg_easy_score:.1f} ({len(easy_scores)} 个)")

    print(f"整体平均分: {avg_score:.1f}")
    print(f"平均置信度: {avg_confidence:.3f}")
    print(f"平均 GOP: {avg_gop:.3f}")
    print()

    # 最好和最差的音素
    best_score = max(scores, key=lambda s: s.score)
    worst_score = min(scores, key=lambda s: s.score)

    print(f"表现最好: {best_score.phoneme} ({best_score.score:.1f}分)")
    print(f"表现最差: {worst_score.phoneme} ({worst_score.score:.1f}分)")
    print()

    print("✅ 测试完成！")
    return True


def main():
    """主函数"""
    if len(sys.argv) < 3:
        print("使用方法:")
        print("  python test_pytorch_model.py <audio_path> <text>")
        print()
        print("示例:")
        print("  python test_pytorch_model.py tests/hello.wav 'hello'")
        sys.exit(1)

    audio_path = sys.argv[1]
    text = sys.argv[2]

    if not os.path.exists(audio_path):
        print(f"❌ 音频文件不存在: {audio_path}")
        sys.exit(1)

    success = test_pytorch_model(audio_path, text)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

