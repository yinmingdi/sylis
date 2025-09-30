"""
声学特征提取器模块 - Step 3: 提取声学特征

使用wav2vec2模型提取音素级的声学特征：
1. Posterior-based: 提取每帧音素后验概率 P(p|O_t)
2. Embedding-based: 提取每帧/音素segment的音频向量
"""

import logging
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass
import numpy as np
import torch
import torch.nn.functional as F
from transformers import Wav2Vec2Model, Wav2Vec2Processor, Wav2Vec2ForCTC
import librosa

from audio_processor import AudioData
from whisperx_aligner import AlignmentResult, WordSegment, PhonemeSegment

logger = logging.getLogger(__name__)


@dataclass
class PhonemeFeatures:
    """音素特征数据结构"""
    phoneme: str                    # 音素符号
    start: float                    # 开始时间
    end: float                      # 结束时间
    posterior_probs: np.ndarray     # 后验概率向量
    embedding: np.ndarray           # 特征向量
    frame_count: int                # 帧数
    confidence: float               # 原始置信度

    @property
    def duration(self) -> float:
        """音素持续时间"""
        return self.end - self.start

    @property
    def avg_posterior(self) -> float:
        """平均后验概率"""
        return float(np.mean(self.posterior_probs)) if len(self.posterior_probs) > 0 else 0.0

    @property
    def max_posterior(self) -> float:
        """最大后验概率"""
        return float(np.max(self.posterior_probs)) if len(self.posterior_probs) > 0 else 0.0


@dataclass
class WordFeatures:
    """单词特征数据结构"""
    word: str                           # 单词文本
    start: float                        # 开始时间
    end: float                          # 结束时间
    phoneme_features: List[PhonemeFeatures]  # 音素特征列表
    word_embedding: np.ndarray          # 单词级特征向量
    confidence: float                   # 原始置信度

    @property
    def duration(self) -> float:
        """单词持续时间"""
        return self.end - self.start

    @property
    def phoneme_count(self) -> int:
        """音素数量"""
        return len(self.phoneme_features)

    @property
    def avg_phoneme_posterior(self) -> float:
        """平均音素后验概率"""
        if not self.phoneme_features:
            return 0.0
        return np.mean([pf.avg_posterior for pf in self.phoneme_features])


@dataclass
class FeatureExtractionResult:
    """特征提取结果"""
    word_features: List[WordFeatures]   # 单词特征列表
    total_frames: int                   # 总帧数
    frame_rate: float                   # 帧率 (frames/second)
    model_name: str                     # 使用的模型名称

    @property
    def word_count(self) -> int:
        """单词数量"""
        return len(self.word_features)

    @property
    def total_phonemes(self) -> int:
        """总音素数量"""
        return sum(wf.phoneme_count for wf in self.word_features)


class FeatureExtractor:
    """
    声学特征提取器类

    功能：
    1. 使用wav2vec2模型提取音频特征
    2. 计算音素级后验概率
    3. 提取音素级embedding向量
    4. 支持多种预训练模型
    """

    # 支持的模型配置
    MODEL_CONFIGS = {
        "wav2vec2-base": {
            "model_name": "facebook/wav2vec2-base-960h",
            "embedding_dim": 768,
            "has_ctc": True,
            "description": "基础模型，适合英语"
        },
        "wav2vec2-large": {
            "model_name": "facebook/wav2vec2-large-960h",
            "embedding_dim": 1024,
            "has_ctc": True,
            "description": "大型模型，更高精度"
        },
        "wav2vec2-xlsr": {
            "model_name": "facebook/wav2vec2-lv-60-espeak-cv-ft",
            "embedding_dim": 1024,
            "has_ctc": True,
            "description": "多语言模型，支持音素"
        }
    }

    def __init__(self,
                 model_name: str = "wav2vec2-base",
                 device: str = "cpu",
                 cache_dir: Optional[str] = None):
        """
        初始化特征提取器

        Args:
            model_name: 模型名称 (wav2vec2-base/wav2vec2-large/wav2vec2-xlsr)
            device: 计算设备 (cpu/cuda)
            cache_dir: 模型缓存目录
        """
        if model_name not in self.MODEL_CONFIGS:
            raise ValueError(f"不支持的模型: {model_name}. 支持的模型: {list(self.MODEL_CONFIGS.keys())}")

        self.model_name = model_name
        self.model_config = self.MODEL_CONFIGS[model_name]
        self.device = device
        self.cache_dir = cache_dir

        # 模型实例（延迟加载）
        self._model = None
        self._processor = None
        self._ctc_model = None


    def extract_features(self,
                        audio_data: AudioData,
                        alignment_result: AlignmentResult) -> FeatureExtractionResult:
        """
        提取音频的声学特征

        Args:
            audio_data: 音频数据
            alignment_result: 对齐结果

        Returns:
            FeatureExtractionResult: 特征提取结果
        """
        try:
            # 初始化模型
            self._initialize_models()


            # Step 1: 提取全局音频特征
            audio_features, frame_rate = self._extract_audio_features(audio_data)

            # Step 2: 计算后验概率
            posterior_probs = self._compute_posterior_probabilities(audio_data)

            # Step 3: 为每个单词和音素提取特征
            word_features = self._extract_word_features(
                alignment_result.words,
                audio_features,
                posterior_probs,
                frame_rate
            )

            result = FeatureExtractionResult(
                word_features=word_features,
                total_frames=audio_features.shape[1],
                frame_rate=frame_rate,
                model_name=self.model_config["model_name"]
            )


            return result

        except Exception as e:
            logger.error(f"❌ 特征提取失败: {e}")
            raise

    def is_ready(self) -> bool:
        """检查模型是否就绪"""
        try:
            self._initialize_models()
            return self._model is not None and self._processor is not None
        except Exception as e:
            logger.error(f"❌ 模型检查失败: {e}")
            return False

    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息"""
        return {
            "model_name": self.model_name,
            "model_config": self.model_config,
            "device": self.device,
            "embedding_dim": self.model_config["embedding_dim"],
            "has_ctc": self.model_config["has_ctc"]
        }

    def _initialize_models(self) -> None:
        """初始化wav2vec2模型"""
        if self._model is not None and self._processor is not None:
            return

        try:
            model_path = self.model_config["model_name"]

            # 加载处理器
            self._processor = Wav2Vec2Processor.from_pretrained(
                model_path,
                cache_dir=self.cache_dir
            )

            # 加载特征提取模型
            self._model = Wav2Vec2Model.from_pretrained(
                model_path,
                cache_dir=self.cache_dir
            ).to(self.device)

            # 如果支持CTC，加载CTC模型用于后验概率计算
            if self.model_config["has_ctc"]:
                self._ctc_model = Wav2Vec2ForCTC.from_pretrained(
                    model_path,
                    cache_dir=self.cache_dir
                ).to(self.device)

            # 设置为评估模式
            self._model.eval()
            if self._ctc_model:
                self._ctc_model.eval()


        except Exception as e:
            logger.error(f"❌ 模型初始化失败: {e}")
            raise

    def _extract_audio_features(self, audio_data: AudioData) -> Tuple[torch.Tensor, float]:
        """提取音频的全局特征"""

        # 预处理音频
        inputs = self._processor(
            audio_data.audio,
            sampling_rate=audio_data.sample_rate,
            return_tensors="pt",
            padding=True
        )

        input_values = inputs.input_values.to(self.device)

        # 提取特征
        with torch.no_grad():
            outputs = self._model(input_values)
            features = outputs.last_hidden_state  # [batch, time, feature_dim]

        # 计算帧率
        audio_length = len(audio_data.audio) / audio_data.sample_rate
        frame_count = features.shape[1]
        frame_rate = frame_count / audio_length


        return features, frame_rate

    def _compute_posterior_probabilities(self, audio_data: AudioData) -> Optional[torch.Tensor]:
        """计算后验概率"""
        if not self._ctc_model:
            logger.warning("⚠️ 无CTC模型，跳过后验概率计算")
            return None


        # 预处理音频
        inputs = self._processor(
            audio_data.audio,
            sampling_rate=audio_data.sample_rate,
            return_tensors="pt",
            padding=True
        )

        input_values = inputs.input_values.to(self.device)

        # 计算logits
        with torch.no_grad():
            outputs = self._ctc_model(input_values)
            logits = outputs.logits  # [batch, time, vocab_size]

        # 转换为概率
        probs = F.softmax(logits, dim=-1)


        return probs

    def _extract_word_features(self,
                             words: List[WordSegment],
                             audio_features: torch.Tensor,
                             posterior_probs: Optional[torch.Tensor],
                             frame_rate: float) -> List[WordFeatures]:
        """为每个单词提取特征"""

        word_features = []

        for word in words:
            # 计算单词的帧范围
            start_frame = int(word.start * frame_rate)
            end_frame = int(word.end * frame_rate)

            # 确保帧范围有效
            start_frame = max(0, start_frame)
            end_frame = min(audio_features.shape[1], end_frame)

            if start_frame >= end_frame:
                logger.warning(f"⚠️ 单词 '{word.word}' 帧范围无效: {start_frame}-{end_frame}")
                continue

            # 提取单词级embedding
            word_embedding = self._extract_word_embedding(
                audio_features, start_frame, end_frame
            )

            # 提取音素级特征
            phoneme_features = self._extract_phoneme_features(
                word.phonemes,
                audio_features,
                posterior_probs,
                frame_rate,
                start_frame,
                end_frame
            )

            word_feature = WordFeatures(
                word=word.word,
                start=word.start,
                end=word.end,
                phoneme_features=phoneme_features,
                word_embedding=word_embedding,
                confidence=word.confidence
            )

            word_features.append(word_feature)


        return word_features

    def _extract_word_embedding(self,
                              audio_features: torch.Tensor,
                              start_frame: int,
                              end_frame: int) -> np.ndarray:
        """提取单词级embedding"""
        # 提取单词对应的帧
        word_frames = audio_features[0, start_frame:end_frame, :]  # [time, feature_dim]

        # 使用平均池化得到单词级表示
        word_embedding = torch.mean(word_frames, dim=0)  # [feature_dim]

        return word_embedding.cpu().numpy()

    def _extract_phoneme_features(self,
                                phonemes: List[PhonemeSegment],
                                audio_features: torch.Tensor,
                                posterior_probs: Optional[torch.Tensor],
                                frame_rate: float,
                                word_start_frame: int,
                                word_end_frame: int) -> List[PhonemeFeatures]:
        """提取音素级特征"""
        phoneme_features = []

        for phoneme in phonemes:
            # 计算音素的帧范围
            start_frame = int(phoneme.start * frame_rate)
            end_frame = int(phoneme.end * frame_rate)

            # 确保在单词范围内
            start_frame = max(word_start_frame, start_frame)
            end_frame = min(word_end_frame, end_frame)

            if start_frame >= end_frame:
                # 如果时间范围无效，使用最小范围
                start_frame = max(0, start_frame)
                end_frame = min(audio_features.shape[1], start_frame + 1)

            # 提取音素embedding
            phoneme_frames = audio_features[0, start_frame:end_frame, :]
            phoneme_embedding = torch.mean(phoneme_frames, dim=0).cpu().numpy()

            # 提取后验概率
            if posterior_probs is not None:
                phoneme_probs = posterior_probs[0, start_frame:end_frame, :]
                # 计算该音素的平均后验概率
                avg_probs = torch.mean(phoneme_probs, dim=0).cpu().numpy()
            else:
                # 如果没有后验概率，使用零向量
                vocab_size = 32  # 假设词汇表大小
                avg_probs = np.zeros(vocab_size)

            phoneme_feature = PhonemeFeatures(
                phoneme=phoneme.phoneme,
                start=phoneme.start,
                end=phoneme.end,
                posterior_probs=avg_probs,
                embedding=phoneme_embedding,
                frame_count=end_frame - start_frame,
                confidence=phoneme.confidence
            )

            phoneme_features.append(phoneme_feature)

        return phoneme_features


def create_feature_extractor(model_name: str = "wav2vec2-base",
                           device: str = "cpu",
                           cache_dir: Optional[str] = None) -> FeatureExtractor:
    """
    创建特征提取器实例的工厂函数

    Args:
        model_name: 模型名称
        device: 计算设备
        cache_dir: 模型缓存目录

    Returns:
        FeatureExtractor: 特征提取器实例
    """
    return FeatureExtractor(
        model_name=model_name,
        device=device,
        cache_dir=cache_dir
    )
