# ARPAbet ➜ IPA 映射（简略，可扩展）
from phoneme_converter import arpabet_to_ipa

def to_azure_transcript(data):
    return {
        "DisplayText": " ".join([w["word"] for w in data]),
        "Words": [
            {
                "Word": w["word"],
                "Offset": int(w["start"] * 1e7),      # 秒转为 100ns
                "Duration": int(w["duration"] * 1e7)
            } for w in data
        ]
    }

def to_azure_gop(data, text):
    ipa_data = []
    for p in data:
        base = p["phoneme"].strip("0123456789")  # 去掉应力标记
        ipa = ARPABET_TO_IPA.get(base)
        ipa_data.append({
            "Phoneme": ipa,
            "Offset": int(p["start"] * 1e7),
            "Duration": int(p["duration"] * 1e7),
            "Confidence": round(p["gop"], 2)
        })
    return {
        "NBest": [{
            "Lexical": text,
            "Phonemes": ipa_data
        }]
    }
