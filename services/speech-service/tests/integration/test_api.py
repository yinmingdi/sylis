"""
Integration tests for API endpoints
"""
import pytest
import io
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app


class TestAPI:
    """API集成测试"""

    def setup_method(self):
        """设置测试客户端"""
        self.client = TestClient(app)

    def test_root_endpoint(self):
        """测试根端点"""
        response = self.client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "sylis-speech-wenet"
        assert data["status"] == "ok"

    def test_health_endpoint(self):
        """测试健康检查端点"""
        response = self.client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "model" in data

    @patch('app.alignment.run_wenet_alignment')
    @patch('app.phoneme_confidence.compute_assessment_scores')
    def test_pronunciation_assess_mock(self, mock_compute, mock_alignment):
        """测试发音评估端点（使用模拟）"""
        # 模拟对齐结果
        mock_alignment.return_value = MagicMock()

        # 模拟评估结果
        mock_compute.return_value = {
            "overallScore": 85.5,
            "accuracyScore": 82.3,
            "fluencyScore": 88.7,
            "completenessScore": 100.0,
            "duration": 2.1,
            "words": []
        }

        # 创建模拟音频文件
        audio_content = b"fake audio content"

        response = self.client.post(
            "/api/pronunciation/assess",
            files={"audio": ("test.wav", io.BytesIO(audio_content), "audio/wav")},
            data={
                "text": "hello world",
                "language": "en-US",
                "enable_phoneme": True
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "overallScore" in data
        assert "modelInfo" in data
        assert data["modelInfo"]["engine"] == "WeNet"

    def test_pronunciation_assess_missing_text(self):
        """测试缺少文本的发音评估"""
        audio_content = b"fake audio content"

        response = self.client.post(
            "/api/pronunciation/assess",
            files={"audio": ("test.wav", io.BytesIO(audio_content), "audio/wav")},
            data={
                "language": "en-US",
                "enable_phoneme": True
            }
        )

        assert response.status_code == 422  # 缺少必需参数

    def test_pronunciation_assess_invalid_file_type(self):
        """测试无效文件类型的发音评估"""
        audio_content = b"fake audio content"

        response = self.client.post(
            "/api/pronunciation/assess",
            files={"audio": ("test.mp3", io.BytesIO(audio_content), "audio/mp3")},
            data={
                "text": "hello world",
                "language": "en-US",
                "enable_phoneme": True
            }
        )

        assert response.status_code == 400
        data = response.json()
        assert "Only .wav is supported" in data["detail"]

    def test_pronunciation_assess_with_real_audio(self, hello_audio_file):
        """测试使用真实音频文件的发音评估"""
        with open(hello_audio_file, "rb") as audio_file:
            audio_content = audio_file.read()

        response = self.client.post(
            "/api/pronunciation/assess",
            files={"audio": ("hello.wav", io.BytesIO(audio_content), "audio/wav")},
            data={
                "text": "hello",
                "language": "en-US",
                "enable_phoneme": True
            }
        )

        # 如果WeNet模型可用，应该返回200；否则可能返回错误
        if response.status_code == 200:
            data = response.json()
            assert "overallScore" in data
            assert "modelInfo" in data
            assert data["modelInfo"]["engine"] == "WeNet"
        else:
            # 模型不可用时的预期行为
            assert response.status_code in [500, 503]

