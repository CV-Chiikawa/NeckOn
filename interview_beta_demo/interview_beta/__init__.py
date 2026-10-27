"""Offline interview posture Beta. Importing this package never opens a camera."""
from .analyzer import InterviewAnalyzer
from .config import Config

__all__ = ['InterviewAnalyzer', 'Config']
