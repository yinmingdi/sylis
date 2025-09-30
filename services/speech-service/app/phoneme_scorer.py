"""
音素评分器模块 - Step 4: 音素级打分

计算音素级发音质量分数：
1. GOP (Goodness of Pronunciation) 基于后验概率
2. Embedding相似度分数基于特征向量比较
"""

import logging
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass
import numpy as np
from scipy.spatial.distance import cosine
from scipy.stats import norm
import json
import os

from feature_extractor import FeatureExtractionResult, WordFeatures, PhonemeFeatures

logger = logging.getLogger(__name__)


@dataclass
class PhonemeScore:
    """音素评分结果"""
    phoneme: str            # 音素符号
    start: float           # 开始时间
    end: float             # 结束时间
    gop_score: float       # GOP分数
    embedding_score: float # Embedding相似度分数
    combined_score: float  # 综合分数
    confidence: float      # 原始置信度

    @property
    def duration(self) -> float:
        """音素持续时间"""
        return self.end - self.start


@dataclass
class WordScore:
    """单词评分结果"""
    word: str                           # 单词文本
    start: float                        # 开始时间
    end: float                          # 结束时间
    phoneme_scores: List[PhonemeScore]  # 音素分数列表
    word_score: float                   # 单词总分
    confidence: float                   # 原始置信度

    @property
    def duration(self) -> float:
        """单词持续时间"""
        return self.end - self.start

    @property
    def phoneme_count(self) -> int:
        """音素数量"""
        return len(self.phoneme_scores)

    @property
    def avg_phoneme_score(self) -> float:
        """平均音素分数"""
        if not self.phoneme_scores:
            return 0.0
        return np.mean([ps.combined_score for ps in self.phoneme_scores])


@dataclass
class ScoringResult:
    """完整的评分结果"""
    word_scores: List[WordScore]    # 单词分数列表
    overall_score: float            # 总体分数
    gop_stats: Dict[str, float]     # GOP统计信息
    embedding_stats: Dict[str, float]  # Embedding统计信息
    model_info: Dict[str, Any]      # 模型信息

    @property
    def word_count(self) -> int:
        """单词数量"""
        return len(self.word_scores)

    @property
    def total_phonemes(self) -> int:
        """总音素数量"""
        return sum(ws.phoneme_count for ws in self.word_scores)


class PhonemeScorer:
    """
    音素评分器类

    功能：
    1. 计算GOP (Goodness of Pronunciation) 分数
    2. 计算embedding相似度分数
    3. 综合多种评分方法
    4. 支持参考音素库
    """

    def __init__(self,
                 reference_data_path: Optional[str] = None,
                 gop_weight: float = 0.6,
                 embedding_weight: float = 0.4,
                 use_duration_normalization: bool = True):
        """
        初始化音素评分器

        Args:
            reference_data_path: 参考音素数据路径
            gop_weight: GOP分数权重
            embedding_weight: Embedding分数权重
            use_duration_normalization: 是否使用时长归一化
        """
        self.reference_data_path = reference_data_path
        self.gop_weight = gop_weight
        self.embedding_weight = embedding_weight
        self.use_duration_normalization = use_duration_normalization

        # 参考数据
        self._reference_embeddings = {}
        self._phoneme_stats = {}

        # 加载参考数据
        if reference_data_path and os.path.exists(reference_data_path):
            self._load_reference_data()
        else:
            logger.warning("⚠️ 未提供参考数据，将使用基础评分方法")


    def score_phonemes(self, feature_result: FeatureExtractionResult) -> ScoringResult:
        """
        对音素进行评分

        Args:
            feature_result: 特征提取结果

        Returns:
            ScoringResult: 评分结果
        """
        try:

            # 评分每个单词
            word_scores = []
            all_gop_scores = []
            all_embedding_scores = []

            for word_features in feature_result.word_features:
                word_score = self._score_word(word_features)
                word_scores.append(word_score)

                # 收集统计信息
                for phoneme_score in word_score.phoneme_scores:
                    all_gop_scores.append(phoneme_score.gop_score)
                    all_embedding_scores.append(phoneme_score.embedding_score)

            # 计算总体分数
            overall_score = self._calculate_overall_score(word_scores)

            # 计算统计信息
            gop_stats = self._calculate_stats(all_gop_scores, "GOP")
            embedding_stats = self._calculate_stats(all_embedding_scores, "Embedding")

            result = ScoringResult(
                word_scores=word_scores,
                overall_score=overall_score,
                gop_stats=gop_stats,
                embedding_stats=embedding_stats,
                model_info={
                    "gop_weight": self.gop_weight,
                    "embedding_weight": self.embedding_weight,
                    "use_duration_normalization": self.use_duration_normalization,
                    "has_reference_data": bool(self._reference_embeddings)
                }
            )


            return result

        except Exception as e:
            logger.error(f"❌ 音素评分失败: {e}")
            raise

    def _score_word(self, word_features: WordFeatures) -> WordScore:
        """评分单个单词"""
        phoneme_scores = []

        for phoneme_features in word_features.phoneme_features:
            phoneme_score = self._score_phoneme(phoneme_features)
            phoneme_scores.append(phoneme_score)

        # 计算单词总分
        if phoneme_scores:
            word_score = np.mean([ps.combined_score for ps in phoneme_scores])
        else:
            word_score = 0.0

        return WordScore(
            word=word_features.word,
            start=word_features.start,
            end=word_features.end,
            phoneme_scores=phoneme_scores,
            word_score=word_score,
            confidence=word_features.confidence
        )

    def _score_phoneme(self, phoneme_features: PhonemeFeatures) -> PhonemeScore:
        """评分单个音素"""
        # 计算GOP分数
        gop_score = self._calculate_gop_score(phoneme_features)

        # 计算Embedding相似度分数
        embedding_score = self._calculate_embedding_score(phoneme_features)

        # 综合分数
        combined_score = (self.gop_weight * gop_score +
                         self.embedding_weight * embedding_score)

        return PhonemeScore(
            phoneme=phoneme_features.phoneme,
            start=phoneme_features.start,
            end=phoneme_features.end,
            gop_score=gop_score,
            embedding_score=embedding_score,
            combined_score=combined_score,
            confidence=phoneme_features.confidence
        )

    def _calculate_gop_score(self, phoneme_features: PhonemeFeatures) -> float:
        """
        计算GOP (Goodness of Pronunciation) 分数

        GOP = log P(phoneme|audio) / duration
        """
        try:
            # 获取后验概率
            posterior_probs = phoneme_features.posterior_probs

            if len(posterior_probs) == 0:
                logger.warning(f"⚠️ 音素 '{phoneme_features.phoneme}' 无后验概率数据")
                return 0.5  # 默认中等分数

            # 使用最大后验概率作为目标音素的概率
            target_prob = phoneme_features.max_posterior

            if target_prob <= 0:
                target_prob = 1e-8  # 避免log(0)

            # 计算log概率
            log_prob = np.log(target_prob)

            # 时长归一化
            if self.use_duration_normalization and phoneme_features.duration > 0:
                gop_raw = log_prob / phoneme_features.duration
            else:
                gop_raw = log_prob

            # 将GOP分数映射到[0, 1]范围
            # 使用sigmoid函数进行归一化
            gop_score = 1 / (1 + np.exp(-gop_raw))

            return float(gop_score)

        except Exception as e:
            logger.error(f"❌ GOP计算失败: {e}")
            return 0.5

    def _calculate_embedding_score(self, phoneme_features: PhonemeFeatures) -> float:
        """
        计算Embedding相似度分数

        使用余弦相似度与参考音素embedding比较
        """
        try:
            phoneme = phoneme_features.phoneme
            user_embedding = phoneme_features.embedding

            # 检查是否有参考数据
            if phoneme not in self._reference_embeddings:
                # 如果没有参考数据，使用基于特征质量的评分
                return self._calculate_feature_quality_score(user_embedding)

            # 获取参考embedding
            reference_embedding = self._reference_embeddings[phoneme]

            # 计算余弦相似度
            similarity = 1 - cosine(user_embedding, reference_embedding)

            # 处理异常值
            if np.isnan(similarity) or np.isinf(similarity):
                similarity = 0.0

            # 将相似度映射到[0, 1]范围
            similarity = max(0.0, min(1.0, similarity))

            return float(similarity)

        except Exception as e:
            logger.error(f"❌ Embedding相似度计算失败: {e}")
            return 0.5

    def _calculate_feature_quality_score(self, embedding: np.ndarray) -> float:
        """
        基于特征质量计算分数（无参考数据时使用）

        使用特征向量的统计特性评估质量
        """
        try:
            # 计算特征向量的统计特性
            mean_val = np.mean(embedding)
            std_val = np.std(embedding)

            # 基于统计特性的质量评分
            # 假设好的发音特征应该有适中的均值和标准差
            mean_score = 1 - abs(mean_val)  # 均值接近0较好
            std_score = min(1.0, std_val)   # 适中的标准差

            # 综合分数
            quality_score = (mean_score + std_score) / 2

            return max(0.0, min(1.0, quality_score))

        except Exception as e:
            logger.error(f"❌ 特征质量评分失败: {e}")
            return 0.5

    def _calculate_overall_score(self, word_scores: List[WordScore]) -> float:
        """计算总体分数"""
        if not word_scores:
            return 0.0

        # 使用加权平均，考虑单词长度
        total_score = 0.0
        total_weight = 0.0

        for word_score in word_scores:
            # 使用音素数量作为权重
            weight = max(1, word_score.phoneme_count)
            total_score += word_score.word_score * weight
            total_weight += weight

        if total_weight > 0:
            return total_score / total_weight
        else:
            return 0.0

    def _calculate_stats(self, scores: List[float], score_type: str) -> Dict[str, float]:
        """计算分数统计信息"""
        if not scores:
            return {
                "mean": 0.0,
                "std": 0.0,
                "min": 0.0,
                "max": 0.0,
                "count": 0
            }

        scores_array = np.array(scores)

        return {
            "mean": float(np.mean(scores_array)),
            "std": float(np.std(scores_array)),
            "min": float(np.min(scores_array)),
            "max": float(np.max(scores_array)),
            "count": len(scores)
        }

    def _load_reference_data(self) -> None:
        """加载参考音素数据"""
        try:

            with open(self.reference_data_path, 'r', encoding='utf-8') as f:
                reference_data = json.load(f)

            # 解析参考embeddings
            if 'phoneme_embeddings' in reference_data:
                for phoneme, embedding_list in reference_data['phoneme_embeddings'].items():
                    self._reference_embeddings[phoneme] = np.array(embedding_list)

            # 解析音素统计信息
            if 'phoneme_stats' in reference_data:
                self._phoneme_stats = reference_data['phoneme_stats']


        except Exception as e:
            logger.error(f"❌ 参考数据加载失败: {e}")
            self._reference_embeddings = {}
            self._phoneme_stats = {}

    def save_reference_data(self,
                          feature_results: List[FeatureExtractionResult],
                          output_path: str) -> None:
        """
        保存参考音素数据

        Args:
            feature_results: 特征提取结果列表（用于构建参考库）
            output_path: 输出文件路径
        """
        try:

            phoneme_embeddings = {}
            phoneme_stats = {}

            # 收集所有音素的embedding
            for result in feature_results:
                for word_features in result.word_features:
                    for phoneme_features in word_features.phoneme_features:
                        phoneme = phoneme_features.phoneme
                        embedding = phoneme_features.embedding

                        if phoneme not in phoneme_embeddings:
                            phoneme_embeddings[phoneme] = []

                        phoneme_embeddings[phoneme].append(embedding.tolist())

            # 计算每个音素的平均embedding
            reference_embeddings = {}
            for phoneme, embeddings in phoneme_embeddings.items():
                if embeddings:
                    avg_embedding = np.mean(embeddings, axis=0)
                    reference_embeddings[phoneme] = avg_embedding.tolist()

                    # 计算统计信息
                    phoneme_stats[phoneme] = {
                        "count": len(embeddings),
                        "mean_norm": float(np.linalg.norm(avg_embedding)),
                        "std": float(np.std(embeddings))
                    }

            # 保存数据
            reference_data = {
                "phoneme_embeddings": reference_embeddings,
                "phoneme_stats": phoneme_stats,
                "metadata": {
                    "total_phonemes": len(reference_embeddings),
                    "total_samples": sum(stats["count"] for stats in phoneme_stats.values()),
                    "created_by": "PhonemeScorer"
                }
            }

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(reference_data, f, indent=2, ensure_ascii=False)


        except Exception as e:
            logger.error(f"❌ 参考数据保存失败: {e}")
            raise


def create_phoneme_scorer(reference_data_path: Optional[str] = None,
                        gop_weight: float = 0.6,
                        embedding_weight: float = 0.4,
                        use_duration_normalization: bool = True) -> PhonemeScorer:
    """
    创建音素评分器实例的工厂函数

    Args:
        reference_data_path: 参考数据路径
        gop_weight: GOP权重
        embedding_weight: Embedding权重
        use_duration_normalization: 是否使用时长归一化

    Returns:
        PhonemeScorer: 音素评分器实例
    """
    return PhonemeScorer(
        reference_data_path=reference_data_path,
        gop_weight=gop_weight,
        embedding_weight=embedding_weight,
        use_duration_normalization=use_duration_normalization
    )
