"""
音素置信度计算模块

基于对齐结果和音素评分，计算综合置信度指标。
包括：
- 音素级置信度
- 单词级置信度
- 句子级置信度
"""

import numpy as np
from typing import List, Dict
from dataclasses import dataclass

from .pytorch_phoneme_scorer import PhonemeScore


@dataclass
class WordConfidence:
    """单词置信度"""
    word: str
    confidence: float
    accuracy_score: float
    phoneme_scores: List[PhonemeScore]


@dataclass
class SentenceConfidence:
    """句子级置信度"""
    overall_score: float       # 总体得分
    accuracy_score: float      # 准确性得分
    fluency_score: float       # 流利度得分
    completeness_score: float  # 完整性得分
    word_confidences: List[WordConfidence]


def calculate_word_confidence(
    phoneme_scores: List[PhonemeScore],
    word: str
) -> WordConfidence:
    """
    计算单词级置信度

    Args:
        phoneme_scores: 该单词的音素评分列表
        word: 单词文本

    Returns:
        WordConfidence: 单词置信度
    """
    if not phoneme_scores:
        return WordConfidence(
            word=word,
            confidence=0.0,
            accuracy_score=0.0,
            phoneme_scores=[]
        )

    # 计算平均置信度
    avg_confidence = np.mean([ps.confidence for ps in phoneme_scores])

    # 计算平均准确度
    avg_accuracy = np.mean([ps.score for ps in phoneme_scores])

    return WordConfidence(
        word=word,
        confidence=avg_confidence,
        accuracy_score=avg_accuracy,
        phoneme_scores=phoneme_scores
    )


def calculate_sentence_confidence(
    phoneme_scores: List[PhonemeScore],
    expected_duration: float,
    actual_duration: float
) -> SentenceConfidence:
    """
    计算句子级置信度

    Args:
        phoneme_scores: 所有音素的评分列表
        expected_duration: 预期时长（秒）
        actual_duration: 实际时长（秒）

    Returns:
        SentenceConfidence: 句子置信度
    """
    if not phoneme_scores:
        return SentenceConfidence(
            overall_score=0.0,
            accuracy_score=0.0,
            fluency_score=0.0,
            completeness_score=0.0,
            word_confidences=[]
        )

    # 1. 准确性得分：基于音素评分
    accuracy_score = np.mean([ps.score for ps in phoneme_scores])

    # 2. 流利度得分：基于语速和连贯性
    fluency_score = calculate_fluency_score(
        phoneme_scores,
        expected_duration,
        actual_duration
    )

    # 3. 完整性得分：检查是否所有音素都被正确发音
    completeness_score = calculate_completeness_score(phoneme_scores)

    # 4. 总体得分：加权平均
    overall_score = (
        accuracy_score * 0.5 +
        fluency_score * 0.3 +
        completeness_score * 0.2
    )

    # 5. 按单词分组计算置信度
    word_confidences = group_by_word(phoneme_scores)

    return SentenceConfidence(
        overall_score=overall_score,
        accuracy_score=accuracy_score,
        fluency_score=fluency_score,
        completeness_score=completeness_score,
        word_confidences=word_confidences
    )


def calculate_fluency_score(
    phoneme_scores: List[PhonemeScore],
    expected_duration: float,
    actual_duration: float
) -> float:
    """
    计算流利度得分

    考虑因素：
    - 语速是否合理（不要太快或太慢）
    - 音素之间的过渡是否自然

    Args:
        phoneme_scores: 音素评分列表
        expected_duration: 预期时长
        actual_duration: 实际时长

    Returns:
        float: 流利度得分 (0-100)
    """
    # 1. 计算语速比率
    if expected_duration > 0:
        speed_ratio = actual_duration / expected_duration
    else:
        speed_ratio = 1.0

    # 理想语速范围：0.8 - 1.2
    if 0.8 <= speed_ratio <= 1.2:
        speed_score = 100.0
    elif 0.6 <= speed_ratio < 0.8 or 1.2 < speed_ratio <= 1.5:
        # 稍快或稍慢
        speed_score = 80.0
    elif 0.4 <= speed_ratio < 0.6 or 1.5 < speed_ratio <= 2.0:
        # 明显过快或过慢
        speed_score = 60.0
    else:
        # 极度异常
        speed_score = 40.0

    # 2. 检查音素间隔的一致性
    if len(phoneme_scores) > 1:
        intervals = []
        for i in range(len(phoneme_scores) - 1):
            gap = phoneme_scores[i + 1].start_time - phoneme_scores[i].end_time
            intervals.append(gap)

        # 计算间隔的标准差（越小越一致）
        interval_std = np.std(intervals) if intervals else 0

        # 标准差小于50ms认为非常流畅
        if interval_std < 0.05:
            consistency_score = 100.0
        elif interval_std < 0.1:
            consistency_score = 90.0
        elif interval_std < 0.2:
            consistency_score = 75.0
        else:
            consistency_score = 60.0
    else:
        consistency_score = 100.0

    # 综合流利度得分
    fluency_score = speed_score * 0.6 + consistency_score * 0.4

    return fluency_score


def calculate_completeness_score(
    phoneme_scores: List[PhonemeScore]
) -> float:
    """
    计算完整性得分

    检查是否所有音素都被正确识别和发音。

    Args:
        phoneme_scores: 音素评分列表

    Returns:
        float: 完整性得分 (0-100)
    """
    if not phoneme_scores:
        return 0.0

    # 统计得分过低的音素（可能是漏读或错读）
    low_score_count = sum(1 for ps in phoneme_scores if ps.score < 40)

    # 计算完整性百分比
    completeness_ratio = 1.0 - (low_score_count / len(phoneme_scores))

    return completeness_ratio * 100


def group_by_word(
    phoneme_scores: List[PhonemeScore]
) -> List[WordConfidence]:
    """
    按单词分组音素评分

    Args:
        phoneme_scores: 音素评分列表

    Returns:
        List[WordConfidence]: 单词置信度列表
    """
    # 按单词分组
    word_groups: Dict[str, List[PhonemeScore]] = {}

    for ps in phoneme_scores:
        word = ps.word
        if word not in word_groups:
            word_groups[word] = []
        word_groups[word].append(ps)

    # 计算每个单词的置信度
    word_confidences = []
    for word, scores in word_groups.items():
        wc = calculate_word_confidence(scores, word)
        word_confidences.append(wc)

    return word_confidences


def calculate_gop_statistics(
    phoneme_scores: List[PhonemeScore]
) -> Dict[str, float]:
    """
    计算 GOP 统计信息

    Args:
        phoneme_scores: 音素评分列表

    Returns:
        Dict: 统计信息
    """
    if not phoneme_scores:
        return {
            'mean_gop': 0.0,
            'std_gop': 0.0,
            'min_gop': 0.0,
            'max_gop': 0.0,
        }

    gop_scores = [ps.gop_score for ps in phoneme_scores]

    return {
        'mean_gop': float(np.mean(gop_scores)),
        'std_gop': float(np.std(gop_scores)),
        'min_gop': float(np.min(gop_scores)),
        'max_gop': float(np.max(gop_scores)),
    }

