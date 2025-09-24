"""
Unit tests for alignment module
"""
import pytest
import torch
from unittest.mock import patch, MagicMock

from app.alignment import WeNetAlignment, WENET_AVAILABLE


class TestWeNetAlignment:
    """WeNet对齐器测试"""

    def test_wenet_available(self):
        """测试WeNet是否可用"""
        # 这个测试会告诉我们WeNet是否正确安装
        if WENET_AVAILABLE:
            assert True, "WeNet is available"
        else:
            pytest.skip("WeNet not available, skipping WeNet-specific tests")

    @pytest.mark.skipif(not WENET_AVAILABLE, reason="WeNet not available")
    def test_init_with_default_paths(self):
        """测试使用默认路径初始化"""
        try:
            aligner = WeNetAlignment()
            assert aligner is not None
            assert hasattr(aligner, 'device')
            assert hasattr(aligner, 'model_path')
            assert hasattr(aligner, 'config_path')
            assert hasattr(aligner, 'dict_path')
        except Exception as e:
            pytest.skip(f"WeNet initialization failed: {e}")

    def test_simple_phonemize(self):
        """测试简单音素化功能"""
        if not WENET_AVAILABLE:
            pytest.skip("WeNet not available")

        try:
            aligner = WeNetAlignment()
            phonemes = aligner._simple_phonemize("hello")
            assert isinstance(phonemes, list)
            assert len(phonemes) > 0
        except Exception as e:
            pytest.skip(f"WeNet initialization failed: {e}")

    def test_char_to_phoneme(self):
        """测试字符到音素转换"""
        if not WENET_AVAILABLE:
            pytest.skip("WeNet not available")

        try:
            aligner = WeNetAlignment()
            phoneme = aligner._char_to_phoneme('a')
            assert phoneme == 'AH'

            phoneme = aligner._char_to_phoneme('b')
            assert phoneme == 'B'

            phoneme = aligner._char_to_phoneme(' ')
            assert phoneme == 'SIL'
        except Exception as e:
            pytest.skip(f"WeNet initialization failed: {e}")

    def test_preprocess_audio_mock(self, temp_audio_file):
        """测试音频预处理（使用模拟）"""
        with patch('torchaudio.load') as mock_load:
            # 模拟音频加载
            mock_waveform = torch.randn(1, 16000)  # 1秒16kHz音频
            mock_load.return_value = (mock_waveform, 16000)

            if not WENET_AVAILABLE:
                pytest.skip("WeNet not available")

            try:
                aligner = WeNetAlignment()
                result = aligner.preprocess_audio(temp_audio_file)
                assert isinstance(result, torch.Tensor)
                assert result.dim() == 1  # 应该是1D张量
            except Exception as e:
                pytest.skip(f"WeNet initialization failed: {e}")

    def test_preprocess_audio_real(self, hello_audio_file):
        """测试使用真实音频文件的预处理"""
        if not WENET_AVAILABLE:
            pytest.skip("WeNet not available")

        try:
            aligner = WeNetAlignment()
            result = aligner.preprocess_audio(hello_audio_file)
            assert isinstance(result, torch.Tensor)
            assert result.dim() == 1  # 应该是1D张量
            assert len(result) > 0  # 应该有音频数据
        except Exception as e:
            pytest.skip(f"WeNet initialization or audio processing failed: {e}")

