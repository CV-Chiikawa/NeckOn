"""Initial Beta heuristics; these are not validated medical thresholds."""
from dataclasses import dataclass, fields
import json
import math


@dataclass(frozen=True)
class Config:
    min_visibility: float = .6
    head_tilt_deg: float = 10.
    shoulder_height_ratio: float = .08
    torso_lean_deg: float = 10.
    camera_roll_deg: float = 0.
    max_depth_width_ratio: float = .8
    caution_seconds: float = 2.
    warning_seconds: float = 4.
    recovery_seconds: float = 1.
    cooldown_seconds: float = 10.
    max_gap_seconds: float = 2.5
    sway_window_seconds: float = 8.
    sway_min_seconds: float = 4.
    sway_amplitude_ratio: float = .22
    sway_reversal_ratio: float = .08
    sway_min_cycles: int = 2
    sway_smoothing_seconds: float = .2

    def __post_init__(self):
        for f in fields(self):
            v = getattr(self, f.name)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError(f'{f.name} must be a finite number')
            if f.name != 'camera_roll_deg' and v <= 0:
                raise ValueError(f'{f.name} must be positive')
        if not 0 < self.min_visibility <= 1:
            raise ValueError('min_visibility must be in (0, 1]')
        if self.warning_seconds < self.caution_seconds:
            raise ValueError('warning_seconds must be >= caution_seconds')
        if self.sway_min_seconds > self.sway_window_seconds:
            raise ValueError('sway_min_seconds must be <= sway_window_seconds')
        if int(self.sway_min_cycles) != self.sway_min_cycles:
            raise ValueError('sway_min_cycles must be an integer')

    @classmethod
    def load(cls, path):
        with open(path, encoding='utf-8') as stream:
            return cls(**json.load(stream))
