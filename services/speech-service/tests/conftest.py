"""
pytest configuration and fixtures
"""
import pytest
import tempfile
import os
from pathlib import Path


@pytest.fixture
def temp_audio_file():
    """使用现有的hello.wav文件用于测试"""
    audio_file_path = Path(__file__).parent / "hello.wav"
    if audio_file_path.exists():
        return str(audio_file_path)
    else:
        # 如果hello.wav不存在，创建临时文件作为后备
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            yield f.name
        try:
            os.unlink(f.name)
        except FileNotFoundError:
            pass


@pytest.fixture
def project_root():
    """获取项目根目录"""
    return Path(__file__).parent.parent


@pytest.fixture
def sample_text():
    """示例文本用于测试"""
    return "hello world"


@pytest.fixture
def hello_audio_file():
    """获取hello.wav文件路径"""
    audio_file_path = Path(__file__).parent / "hello.wav"
    if audio_file_path.exists():
        return str(audio_file_path)
    else:
        pytest.skip("hello.wav file not found in tests directory")

