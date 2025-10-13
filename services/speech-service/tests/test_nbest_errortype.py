#!/usr/bin/env python3
"""
测试 NBest 和 ErrorType 功能
"""
import sys
from pathlib import Path
import json

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.pytorch_phoneme_scorer import create_pytorch_phoneme_scorer
from app.pronunciation_pipeline import create_default_pipeline


def test_nbest_and_errortype():
    """测试 NBest 和 ErrorType 功能"""

    # 1. 初始化流水线
    print("=" * 80)
    print("🧪 测试 NBest 和 ErrorType 功能")
    print("=" * 80)

    pipeline = create_default_pipeline()
    if not pipeline.initialize():
        print("❌ 流水线初始化失败")
        return False

    print("✅ 流水线初始化成功\n")

    # 2. 测试音频
    test_audio = Path(__file__).parent / "hello.wav"
    if not test_audio.exists():
        print(f"❌ 测试音频不存在: {test_audio}")
        return False

    reference_text = "hello"

    print(f"📄 参考文本: {reference_text}")
    print(f"🎵 测试音频: {test_audio}\n")

    # 3. 评估
    print("⏳ 开始评估...")
    result = pipeline.assess_pronunciation(
        audio_path=str(test_audio),
        reference_text=reference_text
    )

    if not result.success:
        print(f"❌ 评估失败: {result.error_message}")
        return False

    print("✅ 评估完成\n")

    # 4. 检查结果
    assessment = result.assessment

    print("=" * 80)
    print("📊 评估结果")
    print("=" * 80)
    print(f"总分: {assessment.overall_score:.1f}")
    print(f"准确度: {assessment.accuracy_score:.1f}")
    print(f"流利度: {assessment.fluency_score:.1f}")
    print(f"完整性: {assessment.completeness_score:.1f}")
    print(f"处理耗时: {result.processing_time:.2f}s\n")

    # 5. 检查单词级详细信息
    print("=" * 80)
    print("🔤 单词级详细信息")
    print("=" * 80)

    for word_detail in assessment.words:
        print(f"\n单词: {word_detail.word}")
        print(f"  分数: {word_detail.score:.1f}")
        print(f"  置信度: {word_detail.confidence:.3f}")
        print(f"  错误类型: {word_detail.error_type}")
        print(f"  时长: {word_detail.duration:.2f}s")

        # 6. 检查音素级详细信息
        print(f"\n  音素详情:")
        print(f"  {'音素':<6} {'分数':<6} {'置信':<6} {'错误类型':<18} {'GOP':<8} {'NBest (Top-5)'}")
        print(f"  {'-'*6} {'-'*6} {'-'*6} {'-'*18} {'-'*8} {'-'*50}")

        for phoneme in word_detail.phonemes:
            # 检查必需字段
            assert hasattr(phoneme, 'error_type'), "❌ 缺少 error_type 字段"
            assert hasattr(phoneme, 'nbest_phonemes'), "❌ 缺少 nbest_phonemes 字段"

            # 格式化 NBest
            nbest_str = ""
            if phoneme.nbest_phonemes:
                assert len(phoneme.nbest_phonemes) == 5, f"❌ NBest 应该有5个候选，实际有 {len(phoneme.nbest_phonemes)}"

                top3 = phoneme.nbest_phonemes[:3]
                nbest_str = " ".join([f"{nb.phoneme}({nb.score:.0f})" for nb in top3])

            print(f"  {phoneme.phoneme:<6} {phoneme.score:<6.1f} {phoneme.confidence:<6.3f} "
                  f"{phoneme.error_type:<18} {phoneme.gop_score:<8.2f} {nbest_str}")

    print("\n" + "=" * 80)
    print("✅ 所有检查通过！")
    print("=" * 80)

    # 7. 输出完整 JSON（用于调试）
    result_dict = result.to_dict()
    json_output = Path(__file__).parent / "test_nbest_output.json"
    with open(json_output, 'w', encoding='utf-8') as f:
        json.dump(result_dict, f, indent=2, ensure_ascii=False)

    print(f"\n💾 完整结果已保存到: {json_output}")

    return True


if __name__ == "__main__":
    try:
        success = test_nbest_and_errortype()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

