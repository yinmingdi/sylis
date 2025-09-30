"""
音频处理器模块 - Step 1: 输入音频 + 目标文本

负责音频文件的加载、预处理和格式转换。
支持WAV/MP3格式，优化为16kHz采样率单声道。
"""

import os
import logging
import numpy as np
from typing import Tuple, Optional
import librosa
import soundfile as sf
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AudioData:
    """音频数据容器"""
    audio: np.ndarray  # 音频数据数组
    sample_rate: int   # 采样率
    duration: float    # 时长（秒）
    channels: int      # 声道数


class AudioProcessor:
    """
    音频处理器类

    功能：
    1. 加载多种格式音频文件（WAV/MP3/FLAC等）
    2. 预处理：重采样到16kHz，转换为单声道
    3. 音频质量检查和噪声抑制（可选）
    4. 音频数据标准化
    """

    TARGET_SAMPLE_RATE = 16000  # WhisperX优化的采样率
    TARGET_CHANNELS = 1         # 单声道

    def __init__(self, enable_noise_reduction: bool = False):
        """
        初始化音频处理器

        Args:
            enable_noise_reduction: 是否启用噪声抑制（需要额外依赖）
        """
        self.enable_noise_reduction = enable_noise_reduction

    def load_audio(self, audio_path: str) -> AudioData:
        """
        加载音频文件

        Args:
            audio_path: 音频文件路径

        Returns:
            AudioData: 包含音频数据和元信息的对象

        Raises:
            FileNotFoundError: 音频文件不存在
            ValueError: 音频文件格式不支持或损坏
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")

        try:

            # 使用librosa加载音频，自动处理多种格式
            audio, sr = librosa.load(
                audio_path,
                sr=None,  # 保持原始采样率
                mono=False  # 保持原始声道数
            )

            # 获取音频信息
            if audio.ndim == 1:
                channels = 1
            else:
                channels = audio.shape[0]

            duration = len(audio) / sr if audio.ndim == 1 else audio.shape[1] / sr


            # 验证音频质量
            self._validate_audio_quality(audio, sr, duration)

            return AudioData(
                audio=audio,
                sample_rate=sr,
                duration=duration,
                channels=channels
            )

        except Exception as e:
            logger.error(f"❌ 音频加载失败: {e}")
            raise ValueError(f"无法加载音频文件 {audio_path}: {e}")

    def preprocess_audio(self, audio_data: AudioData) -> AudioData:
        """
        预处理音频数据

        Args:
            audio_data: 原始音频数据

        Returns:
            AudioData: 预处理后的音频数据（16kHz单声道）
        """

        audio = audio_data.audio
        sr = audio_data.sample_rate

        # 1. 转换为单声道
        if audio_data.channels > 1:
            if audio.ndim == 2:
                audio = librosa.to_mono(audio)
            else:
                audio = np.mean(audio, axis=0)

        # 2. 重采样到目标采样率
        if sr != self.TARGET_SAMPLE_RATE:
            audio = librosa.resample(
                audio,
                orig_sr=sr,
                target_sr=self.TARGET_SAMPLE_RATE
            )
            sr = self.TARGET_SAMPLE_RATE

        # 3. 音频标准化
        audio = self._normalize_audio(audio)

        # 4. 噪声抑制（可选）
        if self.enable_noise_reduction:
            audio = self._reduce_noise(audio)

        # 5. 静音检测和修剪
        audio = self._trim_silence(audio, sr)

        duration = len(audio) / sr


        return AudioData(
            audio=audio,
            sample_rate=sr,
            duration=duration,
            channels=1
        )

    def _validate_audio_quality(self, audio: np.ndarray, sr: int, duration: float) -> None:
        """验证音频质量"""
        # 检查时长
        if duration < 0.1:
            raise ValueError(f"音频时长过短: {duration:.2f}s < 0.1s")

        if duration > 300:  # 5分钟
            logger.warning(f"⚠️ 音频时长较长: {duration:.2f}s，可能影响处理速度")

        # 检查采样率
        if sr < 8000:
            logger.warning(f"⚠️ 采样率较低: {sr}Hz，可能影响识别精度")

        # 检查音频幅度
        if audio.ndim == 1:
            max_amplitude = np.max(np.abs(audio))
        else:
            max_amplitude = np.max(np.abs(audio))

        if max_amplitude < 0.01:
            logger.warning("⚠️ 音频信号较弱，可能影响识别效果")
        elif max_amplitude > 0.95:
            logger.warning("⚠️ 音频信号可能存在削波失真")

    def _normalize_audio(self, audio: np.ndarray) -> np.ndarray:
        """音频标准化"""
        # 移除直流分量
        audio = audio - np.mean(audio)

        # 幅度标准化到[-0.8, 0.8]范围，避免削波
        max_amplitude = np.max(np.abs(audio))
        if max_amplitude > 0:
            audio = audio * (0.8 / max_amplitude)

        return audio

    def _reduce_noise(self, audio: np.ndarray) -> np.ndarray:
        """
        简单的噪声抑制
        注意：这里使用基础的谱减法，实际应用中可考虑RNNoise等更高级方法
        """

        # 使用简单的高通滤波器移除低频噪声
        from scipy.signal import butter, filtfilt

        # 设计高通滤波器（截止频率80Hz）
        nyquist = self.TARGET_SAMPLE_RATE / 2
        low_cutoff = 80 / nyquist
        b, a = butter(4, low_cutoff, btype='high')

        # 应用滤波器
        filtered_audio = filtfilt(b, a, audio)

        return filtered_audio

    def _trim_silence(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """修剪开头和结尾的静音"""
        # 使用librosa的静音检测
        intervals = librosa.effects.split(
            audio,
            top_db=20,  # 静音阈值
            frame_length=2048,
            hop_length=512
        )

        if len(intervals) == 0:
            logger.warning("⚠️ 未检测到有效音频信号")
            return audio

        # 保留所有有效音频段
        trimmed_audio = []
        for start, end in intervals:
            trimmed_audio.append(audio[start:end])

        if trimmed_audio:
            result = np.concatenate(trimmed_audio)
            return result
        else:
            return audio


def create_audio_processor(enable_noise_reduction: bool = False) -> AudioProcessor:
    """
    创建音频处理器实例的工厂函数

    Args:
        enable_noise_reduction: 是否启用噪声抑制

    Returns:
        AudioProcessor: 音频处理器实例
    """
    return AudioProcessor(enable_noise_reduction=enable_noise_reduction)
