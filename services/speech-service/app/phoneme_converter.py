# phoneme_converter.py

ARPABET_TO_IPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AX": "ə", "AXR": "ɚ", "AY": "aɪ",
    "EH": "ɛ", "ER": "ɝ", "EY": "eɪ", "IH": "ɪ", "IX": "ɨ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ",
    "UH": "ʊ", "UW": "u", "UX": "ʉ",

    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ",
    "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "NX": "ɾ̃", "P": "p", "Q": "ʔ",
    "R": "ɹ", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w", "Y": "j",
    "Z": "z", "ZH": "ʒ"
}

def arpabet_to_ipa(phoneme: str) -> str:
    """
    Converts a single ARPAbet phoneme (e.g., 'AH0', 'D') to IPA symbol.
    Stress digits (0,1,2) are removed before mapping.
    """
    base = phoneme.strip("012")
    return ARPABET_TO_IPA.get(base.upper(), base.lower())
