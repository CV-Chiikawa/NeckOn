"""Backend-ready CV decisions. No networking, UI, or LLM dependencies."""
import math
from .config import Config
from .features import extract_features, SwayTracker
from .temporal import TemporalRule

ISSUES=('head_tilt','shoulder_alignment','torso_lean','body_sway')
FEEDBACK={
    'head_tilt':'Keep your head upright.',
    'shoulder_alignment':'Relax and level your shoulders.',
    'torso_lean':'Sit upright over your hips.',
    'body_sway':'Pause repeated side-to-side movement.',
}


class InterviewAnalyzer:
    def __init__(self, config=None):
        self.config=config or Config()
        self.rules={key:TemporalRule(self.config) for key in ISSUES}
        self.sway=SwayTracker(self.config)
        self.last_time=None

    def update(self, landmarks, frame_size, timestamp):
        if not math.isfinite(timestamp) or timestamp<0:
            raise ValueError('timestamp must be finite nonnegative source seconds')
        if self.last_time is not None and timestamp<self.last_time:
            raise ValueError('timestamps must be monotonic')
        self.last_time=timestamp
        f=extract_features(landmarks,frame_size,self.config)
        center,width=f['body_center'],f['shoulder_width']
        f['body_sway']=self.sway.update(timestamp,center['value'],width['value'],center['confidence'])
        thresholds=dict(head_tilt=self.config.head_tilt_deg,
                        shoulder_alignment=self.config.shoulder_height_ratio,
                        torso_lean=self.config.torso_lean_deg,
                        body_sway=self.config.sway_amplitude_ratio)
        items={}; events=[]
        for key in ISSUES:
            item=f[key]
            bad=None if not item['available'] else abs(item['value'])>=thresholds[key]
            if key=='body_sway' and bad is not None:
                bad=bad and item['cycles']>=self.config.sway_min_cycles
            state=self.rules[key].update(timestamp,bad)
            for event in state.pop('events'):
                events.append(dict(event,issue=key,timestamp=timestamp))
            items[key]=dict(state,measurable=item['available'],
                feedback=FEEDBACK[key] if state['state'] in ('CAUTION','WARNING') else None)
        states=[v['state'] for v in items.values()]
        available=sum(f[key]['available'] for key in ISSUES)
        if 'WARNING' in states: status='WARNING'
        elif 'CAUTION' in states: status='CAUTION'
        elif available==0: status='UNAVAILABLE'
        elif 'RECOVERED' in states: status='RECOVERED'
        elif 'CANDIDATE' in states: status='CANDIDATE'
        elif available<len(ISSUES): status='LOW_CONFIDENCE'
        else: status='NORMAL'
        return dict(schema_version='1.0',mode='interview',timestamp=timestamp,
            timestamp_unit='source_seconds',status=status,features=f,items=items,
            visibility_confidence={key:f[key]['confidence'] for key in ISSUES},
            measurement_status='AVAILABLE' if available==len(ISSUES) else 'UNAVAILABLE' if available==0 else 'LOW_CONFIDENCE',
            active_posture_issues=[key for key,v in items.items() if v['state'] in ('CAUTION','WARNING')],
            generated_events=events,recovered=any(v['recovered'] for v in items.values()),
            guidance='Show both ears, shoulders and hips; face a fixed level camera.' if available<len(ISSUES) else None,
            rubric=None)
