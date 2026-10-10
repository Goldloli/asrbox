"""Minimal vendored FireRedASR2 AED inference from FireRedTeam/FireRedASR2S.

Source: https://github.com/FireRedTeam/FireRedASR2S (Apache-2.0), commit
4e7d9aaf4482a47cec1724807026b9b151926eb5. Local adaptations:
- kaldi_native_fbank replaced by the numerically equivalent torchaudio
  Kaldi fbank (the upstream package publishes no Windows wheels); waveforms
  stay at int16 magnitude so the shipped CMVN calibration holds.
- LLM / external-LM / CLI / TextGrid output paths removed; AED only.
"""
from backend.vendor.fireredasr2.asr import FireRedAsr2, FireRedAsr2Config

__all__ = ["FireRedAsr2", "FireRedAsr2Config"]
