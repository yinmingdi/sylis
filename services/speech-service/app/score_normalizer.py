"""
分数归一化器模块 - Step 5: 归一化 & 输出

将音素分数归一化到0-100范围，并生成结构化的JSON输出。
包含详细的诊断信息和可视化数据。
"""

import logging
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import numpy as np
import json
from datetime import datetime

from phoneme_scorer import ScoringResult, WordScore, PhonemeScore

logger = logging.getLogger(__name__)


@dataclass
class NormalizedPhonemeScore:
    """归一化后的音素分数"""
    phoneme: str            # 音素符号
    start: float           # 开始时间
    end: float             # 结束时间
    score: int             # 归一化分数 (0-100)
    raw_score: float       # 原始分数
    gop_score: int         # 归一化GOP分数
    embedding_score: int   # 归一化Embedding分数
    confidence: float      # 原始置信度
    duration: float        # 持续时间
    quality_level: str     # 质量等级 (excellent/good/fair/poor)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)


@dataclass
class NormalizedWordScore:
    """归一化后的单词分数"""
    word: str                                      # 单词文本
    start: float                                   # 开始时间
    end: float                                     # 结束时间
    score: int                                     # 归一化分数 (0-100)
    raw_score: float                               # 原始分数
    phonemes: List[NormalizedPhonemeScore]         # 音素分数列表
    confidence: float                              # 原始置信度
    duration: float                                # 持续时间
    quality_level: str                             # 质量等级

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "word": self.word,
            "start": self.start,
            "end": self.end,
            "score": self.score,
            "raw_score": self.raw_score,
            "phonemes": [p.to_dict() for p in self.phonemes],
            "confidence": self.confidence,
            "duration": self.duration,
            "quality_level": self.quality_level
        }


@dataclass
class PronunciationAssessment:
    """完整的发音评估结果"""
    overall_score: int                          # 总体分数 (0-100)
    overall_quality: str                        # 总体质量等级
    words: List[NormalizedWordScore]            # 单词分数列表
    statistics: Dict[str, Any]                  # 统计信息
    diagnostics: Dict[str, Any]                 # 诊断信息
    metadata: Dict[str, Any]                    # 元数据

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "overall_score": self.overall_score,
            "overall_quality": self.overall_quality,
            "words": [w.to_dict() for w in self.words],
            "statistics": self.statistics,
            "diagnostics": self.diagnostics,
            "metadata": self.metadata
        }

    def to_json(self, indent: int = 2) -> str:
        """转换为JSON字符串"""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


class ScoreNormalizer:
    """
    分数归一化器类

    功能：
    1. 将原始分数归一化到0-100范围
    2. 分配质量等级 (excellent/good/fair/poor)
    3. 生成详细的统计和诊断信息
    4. 输出结构化的JSON结果
    """

    # 质量等级阈值
    QUALITY_THRESHOLDS = {
        "excellent": 85,  # 85-100
        "good": 70,       # 70-84
        "fair": 50,       # 50-69
        "poor": 0         # 0-49
    }

    def __init__(self,
                 normalization_method: str = "min_max",
                 include_diagnostics: bool = True,
                 include_visualization_data: bool = True):
        """
        初始化分数归一化器

        Args:
            normalization_method: 归一化方法 (min_max/z_score/percentile)
            include_diagnostics: 是否包含诊断信息
            include_visualization_data: 是否包含可视化数据
        """
        self.normalization_method = normalization_method
        self.include_diagnostics = include_diagnostics
        self.include_visualization_data = include_visualization_data


    def normalize_scores(self, scoring_result: ScoringResult) -> PronunciationAssessment:
        """
        归一化分数并生成评估结果

        Args:
            scoring_result: 原始评分结果

        Returns:
            PronunciationAssessment: 归一化后的评估结果
        """
        try:

            # Step 1: 收集所有原始分数
            all_scores = self._collect_all_scores(scoring_result)

            # Step 2: 计算归一化参数
            norm_params = self._calculate_normalization_params(all_scores)

            # Step 3: 归一化单词和音素分数
            normalized_words = self._normalize_words(scoring_result.word_scores, norm_params)

            # Step 4: 计算归一化的总体分数
            normalized_overall = self._normalize_score(scoring_result.overall_score, norm_params)
            overall_quality = self._get_quality_level(normalized_overall)

            # Step 5: 生成统计信息
            statistics = self._generate_statistics(normalized_words, scoring_result)

            # Step 6: 生成诊断信息
            diagnostics = {}
            if self.include_diagnostics:
                diagnostics = self._generate_diagnostics(scoring_result, norm_params)

            # Step 7: 生成元数据
            metadata = self._generate_metadata(scoring_result, norm_params)

            result = PronunciationAssessment(
                overall_score=normalized_overall,
                overall_quality=overall_quality,
                words=normalized_words,
                statistics=statistics,
                diagnostics=diagnostics,
                metadata=metadata
            )


            return result

        except Exception as e:
            logger.error(f"❌ 分数归一化失败: {e}")
            raise

    def _collect_all_scores(self, scoring_result: ScoringResult) -> Dict[str, List[float]]:
        """收集所有原始分数"""
        all_scores = {
            "combined": [],
            "gop": [],
            "embedding": [],
            "word": []
        }

        for word_score in scoring_result.word_scores:
            all_scores["word"].append(word_score.word_score)

            for phoneme_score in word_score.phoneme_scores:
                all_scores["combined"].append(phoneme_score.combined_score)
                all_scores["gop"].append(phoneme_score.gop_score)
                all_scores["embedding"].append(phoneme_score.embedding_score)

        # 添加总体分数
        all_scores["overall"] = [scoring_result.overall_score]

        return all_scores

    def _calculate_normalization_params(self, all_scores: Dict[str, List[float]]) -> Dict[str, Dict[str, float]]:
        """计算归一化参数"""
        norm_params = {}

        for score_type, scores in all_scores.items():
            if not scores:
                continue

            scores_array = np.array(scores)

            if self.normalization_method == "min_max":
                # Min-Max归一化
                min_val = np.min(scores_array)
                max_val = np.max(scores_array)

                # 避免除零
                if max_val == min_val:
                    max_val = min_val + 1e-6

                norm_params[score_type] = {
                    "method": "min_max",
                    "min": float(min_val),
                    "max": float(max_val),
                    "range": float(max_val - min_val)
                }

            elif self.normalization_method == "z_score":
                # Z-score归一化
                mean_val = np.mean(scores_array)
                std_val = np.std(scores_array)

                # 避免除零
                if std_val == 0:
                    std_val = 1e-6

                norm_params[score_type] = {
                    "method": "z_score",
                    "mean": float(mean_val),
                    "std": float(std_val)
                }

            elif self.normalization_method == "percentile":
                # 百分位数归一化
                p5 = np.percentile(scores_array, 5)
                p95 = np.percentile(scores_array, 95)

                if p95 == p5:
                    p95 = p5 + 1e-6

                norm_params[score_type] = {
                    "method": "percentile",
                    "p5": float(p5),
                    "p95": float(p95),
                    "range": float(p95 - p5)
                }

        return norm_params

    def _normalize_score(self, raw_score: float, norm_params: Dict[str, Dict[str, float]],
                        score_type: str = "combined") -> int:
        """归一化单个分数到0-100范围"""
        if score_type not in norm_params:
            # 如果没有参数，使用默认归一化
            return max(0, min(100, int(raw_score * 100)))

        params = norm_params[score_type]
        method = params["method"]

        if method == "min_max":
            # Min-Max归一化: (x - min) / (max - min) * 100
            normalized = (raw_score - params["min"]) / params["range"] * 100

        elif method == "z_score":
            # Z-score归一化: (x - mean) / std，然后映射到0-100
            z_score = (raw_score - params["mean"]) / params["std"]
            # 使用sigmoid函数映射到0-100
            normalized = 100 / (1 + np.exp(-z_score))

        elif method == "percentile":
            # 百分位数归一化
            normalized = (raw_score - params["p5"]) / params["range"] * 100

        else:
            normalized = raw_score * 100

        # 确保在0-100范围内
        return max(0, min(100, int(round(normalized))))

    def _normalize_words(self, word_scores: List[WordScore],
                        norm_params: Dict[str, Dict[str, float]]) -> List[NormalizedWordScore]:
        """归一化单词分数"""
        normalized_words = []

        for word_score in word_scores:
            # 归一化音素分数
            normalized_phonemes = []
            for phoneme_score in word_score.phoneme_scores:
                normalized_combined = self._normalize_score(phoneme_score.combined_score, norm_params, "combined")
                normalized_gop = self._normalize_score(phoneme_score.gop_score, norm_params, "gop")
                normalized_embedding = self._normalize_score(phoneme_score.embedding_score, norm_params, "embedding")

                normalized_phoneme = NormalizedPhonemeScore(
                    phoneme=phoneme_score.phoneme,
                    start=phoneme_score.start,
                    end=phoneme_score.end,
                    score=normalized_combined,
                    raw_score=phoneme_score.combined_score,
                    gop_score=normalized_gop,
                    embedding_score=normalized_embedding,
                    confidence=phoneme_score.confidence,
                    duration=phoneme_score.duration,
                    quality_level=self._get_quality_level(normalized_combined)
                )

                normalized_phonemes.append(normalized_phoneme)

            # 归一化单词分数
            normalized_word_score = self._normalize_score(word_score.word_score, norm_params, "word")

            normalized_word = NormalizedWordScore(
                word=word_score.word,
                start=word_score.start,
                end=word_score.end,
                score=normalized_word_score,
                raw_score=word_score.word_score,
                phonemes=normalized_phonemes,
                confidence=word_score.confidence,
                duration=word_score.duration,
                quality_level=self._get_quality_level(normalized_word_score)
            )

            normalized_words.append(normalized_word)

        return normalized_words

    def _get_quality_level(self, score: int) -> str:
        """根据分数获取质量等级"""
        if score >= self.QUALITY_THRESHOLDS["excellent"]:
            return "excellent"
        elif score >= self.QUALITY_THRESHOLDS["good"]:
            return "good"
        elif score >= self.QUALITY_THRESHOLDS["fair"]:
            return "fair"
        else:
            return "poor"

    def _generate_statistics(self, normalized_words: List[NormalizedWordScore],
                           scoring_result: ScoringResult) -> Dict[str, Any]:
        """生成统计信息"""
        # 收集所有归一化分数
        word_scores = [w.score for w in normalized_words]
        phoneme_scores = []
        for word in normalized_words:
            phoneme_scores.extend([p.score for p in word.phonemes])

        # 质量等级分布
        quality_distribution = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        for word in normalized_words:
            quality_distribution[word.quality_level] += 1

        # 音素质量分布
        phoneme_quality_distribution = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        for word in normalized_words:
            for phoneme in word.phonemes:
                phoneme_quality_distribution[phoneme.quality_level] += 1

        statistics = {
            "word_statistics": {
                "count": len(word_scores),
                "mean_score": float(np.mean(word_scores)) if word_scores else 0.0,
                "std_score": float(np.std(word_scores)) if word_scores else 0.0,
                "min_score": int(np.min(word_scores)) if word_scores else 0,
                "max_score": int(np.max(word_scores)) if word_scores else 0,
                "quality_distribution": quality_distribution
            },
            "phoneme_statistics": {
                "count": len(phoneme_scores),
                "mean_score": float(np.mean(phoneme_scores)) if phoneme_scores else 0.0,
                "std_score": float(np.std(phoneme_scores)) if phoneme_scores else 0.0,
                "min_score": int(np.min(phoneme_scores)) if phoneme_scores else 0,
                "max_score": int(np.max(phoneme_scores)) if phoneme_scores else 0,
                "quality_distribution": phoneme_quality_distribution
            },
            "timing_statistics": {
                "total_duration": sum(w.duration for w in normalized_words),
                "avg_word_duration": np.mean([w.duration for w in normalized_words]) if normalized_words else 0.0,
                "avg_phoneme_duration": np.mean([p.duration for w in normalized_words for p in w.phonemes]) if normalized_words else 0.0
            }
        }

        return statistics

    def _generate_diagnostics(self, scoring_result: ScoringResult,
                            norm_params: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
        """生成诊断信息"""
        diagnostics = {
            "normalization_info": {
                "method": self.normalization_method,
                "parameters": norm_params
            },
            "raw_statistics": {
                "gop_stats": scoring_result.gop_stats,
                "embedding_stats": scoring_result.embedding_stats
            },
            "model_info": scoring_result.model_info,
            "potential_issues": self._identify_potential_issues(scoring_result)
        }

        if self.include_visualization_data:
            diagnostics["visualization_data"] = self._generate_visualization_data(scoring_result)

        return diagnostics

    def _identify_potential_issues(self, scoring_result: ScoringResult) -> List[Dict[str, Any]]:
        """识别潜在问题"""
        issues = []

        # 检查分数分布
        all_scores = []
        for word_score in scoring_result.word_scores:
            for phoneme_score in word_score.phoneme_scores:
                all_scores.append(phoneme_score.combined_score)

        if all_scores:
            score_std = np.std(all_scores)
            score_mean = np.mean(all_scores)

            if score_std < 0.1:
                issues.append({
                    "type": "low_variance",
                    "description": "分数方差过低，可能存在模型问题",
                    "severity": "warning"
                })

            if score_mean < 0.3:
                issues.append({
                    "type": "low_overall_quality",
                    "description": "整体发音质量较低",
                    "severity": "info"
                })

            if score_mean > 0.9:
                issues.append({
                    "type": "suspiciously_high",
                    "description": "分数异常高，可能存在过拟合",
                    "severity": "warning"
                })

        # 检查时长异常
        for word_score in scoring_result.word_scores:
            if word_score.duration > 3.0:  # 单词超过3秒
                issues.append({
                    "type": "long_duration",
                    "description": f"单词 '{word_score.word}' 发音时长过长 ({word_score.duration:.2f}s)",
                    "severity": "info"
                })

        return issues

    def _generate_visualization_data(self, scoring_result: ScoringResult) -> Dict[str, Any]:
        """生成可视化数据"""
        # 时间轴数据
        timeline_data = []
        for word_score in scoring_result.word_scores:
            word_data = {
                "word": word_score.word,
                "start": word_score.start,
                "end": word_score.end,
                "score": word_score.word_score,
                "phonemes": []
            }

            for phoneme_score in word_score.phoneme_scores:
                phoneme_data = {
                    "phoneme": phoneme_score.phoneme,
                    "start": phoneme_score.start,
                    "end": phoneme_score.end,
                    "score": phoneme_score.combined_score
                }
                word_data["phonemes"].append(phoneme_data)

            timeline_data.append(word_data)

        # 分数分布数据
        all_scores = []
        for word_score in scoring_result.word_scores:
            for phoneme_score in word_score.phoneme_scores:
                all_scores.append(phoneme_score.combined_score)

        score_histogram = np.histogram(all_scores, bins=10) if all_scores else ([], [])

        return {
            "timeline": timeline_data,
            "score_distribution": {
                "counts": score_histogram[0].tolist(),
                "bins": score_histogram[1].tolist()
            }
        }

    def _generate_metadata(self, scoring_result: ScoringResult,
                          norm_params: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
        """生成元数据"""
        return {
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0",
            "normalization_method": self.normalization_method,
            "total_words": scoring_result.word_count,
            "total_phonemes": scoring_result.total_phonemes,
            "processing_info": {
                "include_diagnostics": self.include_diagnostics,
                "include_visualization": self.include_visualization_data
            }
        }


def create_score_normalizer(normalization_method: str = "min_max",
                          include_diagnostics: bool = True,
                          include_visualization_data: bool = True) -> ScoreNormalizer:
    """
    创建分数归一化器实例的工厂函数

    Args:
        normalization_method: 归一化方法
        include_diagnostics: 是否包含诊断信息
        include_visualization_data: 是否包含可视化数据

    Returns:
        ScoreNormalizer: 分数归一化器实例
    """
    return ScoreNormalizer(
        normalization_method=normalization_method,
        include_diagnostics=include_diagnostics,
        include_visualization_data=include_visualization_data
    )
