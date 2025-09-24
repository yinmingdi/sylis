from typing import Dict, List

from .alignment import AlignmentResult, WordSegment, PhonemeSegment


EXPECTED_PHONE_MS = 200.0  # simple global expectation for minimal viable scoring (adjusted for realistic phoneme duration)


def _duration_confidence(duration_s: float) -> float:
    expected = EXPECTED_PHONE_MS / 1000.0
    if duration_s <= 1e-6:
        return 0.0
    r = abs(duration_s - expected) / expected
    # Map r in [0, +inf) to (0,1]; clamp for stability
    c = max(0.0, 1.0 - min(r, 1.0))
    return round(c, 4)


def _aggregate_scores(values: List[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values) * 100.0, 2)


def compute_assessment_scores(alignment_result: AlignmentResult, enable_phoneme: bool = True) -> Dict:
    words_out = []
    phone_confs_all: List[float] = []

    for w in alignment_result.words:
        word_phones = []
        per_word_confs: List[float] = []
        for p in w.phonemes:
            # 只使用 WeNet 提供的置信度，不使用时长启发式
            model_conf = getattr(p, 'confidence', None)
            conf = float(model_conf) if isinstance(model_conf, (int, float)) else 0.0
            # 边界保护
            conf = max(0.0, min(1.0, conf))
            per_word_confs.append(conf)
            phone_confs_all.append(conf)
            if enable_phoneme:
                word_phones.append({
                    "phoneme": p.phoneme,
                    "start": round(p.start, 3),
                    "end": round(p.end, 3),
                    "confidence": conf,
                })

        word_score = _aggregate_scores(per_word_confs)
        words_out.append({
            "word": w.word,
            "start": round(w.start, 3),
            "end": round(w.end, 3),
            "accuracyScore": word_score,
            "phonemes": word_phones,
        })

    accuracy = _aggregate_scores(phone_confs_all)
    fluency = round(min(100.0, max(0.0, len(alignment_result.words) / max(0.5, alignment_result.duration) * 10.0 * 10.0)), 2)
    completeness = round(100.0 if alignment_result.words else 0.0, 2)
    overall = round(0.6 * accuracy + 0.25 * fluency + 0.15 * completeness, 2)

    return {
        "overallScore": overall,
        "accuracyScore": accuracy,
        "fluencyScore": fluency,
        "completenessScore": completeness,
        "duration": round(alignment_result.duration, 3),
        "words": words_out,
    }


