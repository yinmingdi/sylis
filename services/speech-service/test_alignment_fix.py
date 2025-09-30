#!/usr/bin/env python3
"""
测试修复后的音素对齐功能
"""

import os
import sys
import logging

# 设置espeak环境变量
os.environ['ESPEAK_DATA_PATH'] = '/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data'
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = '/opt/homebrew/lib/libespeak.dylib'

# 添加当前目录到Python路径
sys.path.append('.')

from app.alignment import run_mfa_alignment

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_alignment():
    """测试音素对齐功能"""
    try:
        # 使用一个简单的测试音频文件（如果存在）
        audio_path = "test_audio.wav"  # 你需要提供一个测试音频文件

        if not os.path.exists(audio_path):
            logger.warning(f"测试音频文件 {audio_path} 不存在，跳过测试")
            return

        logger.info("🎯 开始测试音素对齐...")

        # 运行对齐
        result = run_mfa_alignment(audio_path, "hello world", "en-US")

        logger.info("✅ 对齐完成！")
        logger.info(f"📊 结果统计:")
        logger.info(f"  - 单词数: {len(result.words)}")
        logger.info(f"  - 总时长: {result.duration:.2f}s")
        logger.info(f"  - 转录文本: '{result.transcript}'")

        # 打印每个单词的详细信息
        for i, word in enumerate(result.words):
            logger.info(f"  - 单词 {i+1}: '{word.word}' ({word.start:.3f}s-{word.end:.3f}s, 置信度: {word.confidence:.3f})")
            logger.info(f"    音素数: {len(word.phonemes)}")
            for j, phoneme in enumerate(word.phonemes):
                logger.info(f"      - 音素 {j+1}: '{phoneme.phoneme}' ({phoneme.start:.3f}s-{phoneme.end:.3f}s, 置信度: {phoneme.confidence:.3f})")

    except Exception as e:
        logger.error(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_alignment()
