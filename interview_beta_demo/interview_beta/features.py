"""Aspect-correct 2D image features, independent of OpenCV and MediaPipe imports."""
from collections import deque
import math
import statistics


def feature(value, unit, confidence=0., reason=None, direction=None, **extra):
    return dict(value=value, unit=unit, available=value is not None,
                confidence=confidence, reason=reason, direction=direction, **extra)


def extract_features(landmarks, frame_size, config):
    width, height = frame_size
    if width <= 0 or height <= 0:
        raise ValueError('frame_size must be positive (width, height)')
    theta = math.radians(config.camera_roll_deg)
    c, s = math.cos(theta), math.sin(theta)

    def point(index):
        if landmarks is None or len(landmarks) <= index:
            return None
        lm = landmarks[index]
        vals = [getattr(lm, key, None) for key in ('x','y','z','visibility')]
        if any(v is None or not math.isfinite(v) for v in vals):
            return None
        x, y, z, vis = vals
        if not (0 <= x <= 1 and 0 <= y <= 1 and config.min_visibility <= vis <= 1):
            return None
        x, y = x * width, y * height
        return (c*x+s*y, -s*x+c*y, z*width, vis)

    le, re, ls, rs, lh, rh = (point(i) for i in (7,8,11,12,23,24))
    out = {
        'head_tilt': feature(None,'image_degrees',reason='ears_missing_or_low_visibility'),
        'shoulder_alignment': feature(None,'shoulder_width_ratio',reason='shoulders_missing_or_low_visibility'),
        'torso_lean': feature(None,'image_degrees',reason='shoulders_or_hips_missing_or_low_visibility'),
        'body_center': feature(None,'image_width_ratio',reason='shoulders_or_hips_missing_or_low_visibility'),
        'shoulder_width': feature(None,'image_width_ratio',reason='shoulders_missing_or_low_visibility'),
    }
    if le and re:
        dx, dy = le[0]-re[0], le[1]-re[1]
        if abs(dx) < .04*width or abs(le[2]-re[2])/max(abs(dx),1e-9) > config.max_depth_width_ratio:
            out['head_tilt']['reason'] = 'head_rotation_or_degenerate_geometry'
        else:
            angle = math.degrees(math.atan2(dy,abs(dx)))
            out['head_tilt'] = feature(angle,'image_degrees',min(le[3],re[3]),
                direction='subject_left' if angle>0 else 'subject_right' if angle<0 else 'neutral')
    if ls and rs:
        sw = math.hypot(ls[0]-rs[0],ls[1]-rs[1])
        if abs(ls[0]-rs[0]) < .05*width or abs(ls[2]-rs[2])/max(sw,1e-9) > config.max_depth_width_ratio:
            for key in ('shoulder_alignment','torso_lean','body_center','shoulder_width'):
                out[key]['reason'] = 'body_rotation_or_degenerate_geometry'
        else:
            conf=min(ls[3],rs[3])
            ratio=(rs[1]-ls[1])/sw
            out['shoulder_alignment']=feature(ratio,'shoulder_width_ratio',conf,
                direction='subject_left_high' if ratio>0 else 'subject_right_high' if ratio<0 else 'neutral')
            out['shoulder_width']=feature(sw/width,'image_width_ratio',conf)
            if lh and rh:
                sx,sy=(ls[0]+rs[0])/2,(ls[1]+rs[1])/2
                hx,hy=(lh[0]+rh[0])/2,(lh[1]+rh[1])/2
                conf=min(conf,lh[3],rh[3])
                if hy-sy > .05*height:
                    angle=math.degrees(math.atan2(sx-hx,hy-sy))
                    out['torso_lean']=feature(angle,'image_degrees',conf,
                        direction='image_right' if angle>0 else 'image_left' if angle<0 else 'neutral')
                    out['body_center']=feature((sx+hx)/(2*width),'image_width_ratio',conf)
                else:
                    out['torso_lean']['reason']='degenerate_torso_geometry'
                    out['body_center']['reason']='degenerate_torso_geometry'
    return out


class SwayTracker:
    """Time-window significant reversals; one translation cannot become a cycle."""
    def __init__(self, config):
        self.config=config
        self.history=deque()
        self.last_time=None
        self.smoothed=None

    def update(self, now, center, shoulder_width, confidence=1.):
        cfg=self.config
        if self.last_time is not None and now < self.last_time:
            raise ValueError('timestamps must be monotonic')
        gap=self.last_time is not None and now-self.last_time>cfg.max_gap_seconds
        dt=0 if self.last_time is None else now-self.last_time
        self.last_time=now
        if gap or center is None or shoulder_width is None:
            self.history.clear(); self.smoothed=None
        if center is None or shoulder_width is None:
            return feature(None,'shoulder_width_ratio',reason='body_center_unavailable',cycles=0)
        if self.history and abs(shoulder_width/self.history[0][2]-1)>.25:
            self.history.clear(); self.smoothed=None
        alpha=1-math.exp(-dt/cfg.sway_smoothing_seconds)
        self.smoothed=center if self.smoothed is None else self.smoothed+alpha*(center-self.smoothed)
        self.history.append((now,self.smoothed,shoulder_width))
        while self.history and now-self.history[0][0]>cfg.sway_window_seconds:
            self.history.popleft()
        if now-self.history[0][0]<cfg.sway_min_seconds:
            return feature(None,'shoulder_width_ratio',confidence,reason='warming_up',cycles=0)
        scale=statistics.median(p[2] for p in self.history)
        values=[p[1]/scale for p in self.history]
        low=high=values[0]; direction=0; reversals=0
        for v in values[1:]:
            if direction==0:
                low=min(low,v); high=max(high,v)
                if v-low>=cfg.sway_reversal_ratio: direction=1; high=v
                elif high-v>=cfg.sway_reversal_ratio: direction=-1; low=v
            elif direction==1:
                high=max(high,v)
                if high-v>=cfg.sway_reversal_ratio:
                    reversals+=1; direction=-1; low=v
            else:
                low=min(low,v)
                if v-low>=cfg.sway_reversal_ratio:
                    reversals+=1; direction=1; high=v
        return feature(max(values)-min(values),'shoulder_width_ratio',confidence,
                       cycles=reversals//2, window_seconds=now-self.history[0][0])
