"""Observed-time posture state machine. Missing data breaks continuity."""


class TemporalRule:
    def __init__(self, config):
        self.config=config
        self.last_time=None
        self.previous_bad=None
        self.bad_since=None
        self.good_since=None
        self.state='NORMAL'
        self.confirmed=False
        self.duration=0.
        self.last_events={}

    def update(self, now, bad):
        cfg=self.config
        if self.last_time is not None and now<self.last_time:
            raise ValueError('timestamps must be monotonic')
        gap=self.last_time is not None and now-self.last_time>cfg.max_gap_seconds
        dt=0. if self.last_time is None else now-self.last_time
        previous_bad=self.previous_bad
        self.previous_bad=bad
        self.last_time=now
        events=[]
        if gap or bad is None:
            self.bad_since=self.good_since=None
            self.confirmed=False
            self.duration=0.
            self.state='UNAVAILABLE'
            previous_bad=None
        if bad is None:
            return self._result(events)
        if bad:
            self.good_since=None
            if self.bad_since is None:
                self.bad_since=now
                self.duration=0.
            if previous_bad is True:
                self.duration+=dt
            target=('WARNING' if self.duration>=cfg.warning_seconds else
                    'CAUTION' if self.duration>=cfg.caution_seconds else 'CANDIDATE')
            # A short good interval cannot downgrade a confirmed warning.
            if self.confirmed and self.state=='WARNING': target='WARNING'
            if target in ('CAUTION','WARNING'):
                self.confirmed=True
                if target!=self.state and now-self.last_events.get(target,float('-inf'))>=cfg.cooldown_seconds:
                    events.append(dict(type=target,duration_seconds=self.duration))
                    self.last_events[target]=now
            self.state=target
        elif self.confirmed:
            if self.good_since is None: self.good_since=now
            if now-self.good_since>=cfg.recovery_seconds:
                events.append(dict(type='RECOVERED',duration_seconds=self.duration))
                self.state='RECOVERED'; self.confirmed=False
                self.bad_since=self.good_since=None
        else:
            self.state='NORMAL'; self.bad_since=self.good_since=None; self.duration=0.
        return self._result(events)

    def _result(self, events):
        return dict(state=self.state,duration_seconds=self.duration,
                    recovered=self.state=='RECOVERED',events=events)
