import json
import math
import unittest
from types import SimpleNamespace as Point
from interview_beta.features import extract_features, SwayTracker
from interview_beta.temporal import TemporalRule
from interview_beta.analyzer import InterviewAnalyzer
from interview_beta.config import Config


def pose():
    pts = [Point(x=.5, y=.5, z=0., visibility=1.) for _ in range(33)]
    for i, x, y in [(7,.6,.2),(8,.4,.2),(11,.7,.4),(12,.3,.4),(23,.65,.8),(24,.35,.8)]:
        pts[i] = Point(x=x,y=y,z=0.,visibility=1.)
    return pts


class FeatureTests(unittest.TestCase):
    def test_neutral_and_aspect_correct_angle(self):
        p=pose()
        f=extract_features(p,(1000,500),Config())
        self.assertAlmostEqual(f['torso_lean']['value'],0.)
        p[7].y=.3
        f=extract_features(p,(1000,500),Config())
        self.assertAlmostEqual(f['head_tilt']['value'],math.degrees(math.atan(.25)))
        self.assertEqual(f['head_tilt']['direction'],'subject_left')

    def test_shoulder_and_torso_directions(self):
        p=pose(); p[11].y=.3
        f=extract_features(p,(1000,500),Config())
        self.assertGreater(f['shoulder_alignment']['value'],.1)
        self.assertEqual(f['shoulder_alignment']['direction'],'subject_left_high')
        p=pose(); p[11].x+=.1; p[12].x+=.1
        f=extract_features(p,(1000,500),Config())
        self.assertGreater(f['torso_lean']['value'],20.)
        self.assertEqual(f['torso_lean']['direction'],'image_right')

    def test_missing_hip_does_not_disable_head(self):
        p=pose(); p[23].visibility=.1
        f=extract_features(p,(640,480),Config())
        self.assertTrue(f['head_tilt']['available'])
        self.assertFalse(f['torso_lean']['available'])
        self.assertIsNone(f['torso_lean']['value'])

    def test_out_of_frame_and_nonfinite_rejected(self):
        for value in [-.2,1.2,float('nan')]:
            p=pose(); p[7].x=value
            self.assertFalse(extract_features(p,(640,480),Config())['head_tilt']['available'])

    def test_rotation_guard(self):
        p=pose(); p[11].z=.6
        f=extract_features(p,(640,480),Config())
        self.assertFalse(f['shoulder_alignment']['available'])
        self.assertIn('rotation',f['shoulder_alignment']['reason'])

    def test_camera_roll_setting(self):
        p=pose(); p[7].y=.3
        angle=math.degrees(math.atan(.25))
        f=extract_features(p,(1000,500),Config(camera_roll_deg=angle))
        self.assertAlmostEqual(f['head_tilt']['value'],0.)


class TemporalTests(unittest.TestCase):
    def test_persistent_recovery_and_cooldown(self):
        r=TemporalRule(Config())
        self.assertEqual(r.update(0,True)['state'],'CANDIDATE')
        self.assertEqual(r.update(1,True)['state'],'CANDIDATE')
        x=r.update(2,True)
        self.assertEqual(x['state'],'CAUTION')
        self.assertEqual(x['events'][0]['type'],'CAUTION')
        self.assertEqual(r.update(4,True)['state'],'WARNING')
        self.assertEqual(r.update(4.1,True)['events'],[])
        r.update(4.2,False)
        self.assertEqual(r.update(5.3,False)['state'],'RECOVERED')
        self.assertEqual(r.update(5.4,False)['state'],'NORMAL')
        r.update(5.5,True)
        self.assertEqual(r.update(7.6,True)['events'],[])

    def test_transient_has_no_confirmed_event(self):
        r=TemporalRule(Config()); r.update(0,True)
        self.assertEqual(r.update(.4,False)['state'],'NORMAL')
        self.assertEqual(r.update(.5,False)['events'],[])

    def test_dropout_resets_without_false_recovery(self):
        r=TemporalRule(Config()); r.update(0,True); r.update(1,True)
        self.assertEqual(r.update(1.1,None)['state'],'UNAVAILABLE')
        x=r.update(10,True)
        self.assertEqual(x['state'],'CANDIDATE')
        self.assertEqual(x['duration_seconds'],0.)
        self.assertEqual(x['events'],[])

    def test_unobserved_time_gap_does_not_count(self):
        r=TemporalRule(Config()); r.update(0,True)
        self.assertEqual(r.update(30,True)['state'],'CANDIDATE')

    def test_time_must_be_monotonic(self):
        r=TemporalRule(Config()); r.update(3,False)
        with self.assertRaises(ValueError): r.update(2,True)


class SwayTests(unittest.TestCase):
    def test_repeated_oscillation(self):
        s=SwayTracker(Config())
        for i in range(81): f=s.update(i/10,.5+.08*math.sin(2*math.pi*i/20),.4)
        self.assertTrue(f['available'])
        self.assertGreaterEqual(f['cycles'],2)
        self.assertGreater(f['value'],.2)

    def test_single_adjustment_not_sway(self):
        s=SwayTracker(Config())
        for i in range(81): f=s.update(i/10,.4 if i<40 else .55,.4)
        self.assertEqual(f['cycles'],0)

    def test_jitter_and_dropout(self):
        s=SwayTracker(Config())
        for i in range(81): f=s.update(i/10,.5+(.001 if i%2 else -.001),.4)
        self.assertEqual(f['cycles'],0)
        self.assertFalse(s.update(8.2,None,None)['available'])
        self.assertFalse(s.update(8.3,.5,.4)['available'])


class IntegrationTests(unittest.TestCase):
    def test_json_and_partial_visibility(self):
        a=InterviewAnalyzer(); r=a.update(pose(),(640,480),0.)
        self.assertEqual(r['mode'],'interview')
        self.assertEqual(r['status'],'LOW_CONFIDENCE')
        json.dumps(r,allow_nan=False)
        r=a.update(None,(640,480),.1)
        self.assertEqual(r['status'],'UNAVAILABLE')
        self.assertEqual(r['active_posture_issues'],[])
        self.assertFalse(r['recovered'])

    def test_head_issue_then_recovery(self):
        a=InterviewAnalyzer(); p=pose(); p[7].y=.35; events=[]
        for i in range(51):
            r=a.update(p,(640,480),i/10); events.extend(r['generated_events'])
        self.assertEqual(r['items']['head_tilt']['state'],'WARNING')
        self.assertIn('head_tilt',r['active_posture_issues'])
        self.assertEqual([e['type'] for e in events if e['issue']=='head_tilt'],['CAUTION','WARNING'])
        for i in range(51,66):
            r=a.update(pose(),(640,480),i/10); events.extend(r['generated_events'])
        self.assertTrue(any(e['type']=='RECOVERED' and e['issue']=='head_tilt' for e in events))

    def test_config_rejects_invalid_values(self):
        for kw in [dict(caution_seconds=-1),dict(warning_seconds=1),dict(min_visibility=2),dict(sway_window_seconds=0)]:
            with self.assertRaises(ValueError): Config(**kw)

class RegressionTests(unittest.TestCase):
    def test_normal_interval_not_counted_as_bad_duration(self):
        r=TemporalRule(Config())
        r.update(0,True); r.update(2,True)
        r.update(2.1,False); r.update(2.9,False)
        x=r.update(3,True)
        self.assertAlmostEqual(x['duration_seconds'],2.)

    def test_both_head_directions(self):
        p=pose(); p[8].y=.35
        self.assertEqual(extract_features(p,(640,480),Config())['head_tilt']['direction'],'subject_right')

    def test_stable_full_body_becomes_normal_after_warmup(self):
        a=InterviewAnalyzer()
        for i in range(60): r=a.update(pose(),(640,480),i/10)
        self.assertEqual(r['status'],'NORMAL')
        self.assertEqual(r['measurement_status'],'AVAILABLE')

    def test_sustained_shoulder_and_torso_generate_warnings(self):
        for key in ['shoulder_alignment','torso_lean']:
            p=pose()
            if key=='shoulder_alignment': p[11].y=.3
            else: p[11].x+=.15; p[12].x+=.15
            a=InterviewAnalyzer()
            for i in range(51): r=a.update(p,(640,480),i/10)
            self.assertEqual(r['items'][key]['state'],'WARNING')

    def test_repeated_sway_warning_and_missing_hip_clears(self):
        a=InterviewAnalyzer()
        for i in range(151):
            p=pose(); shift=.09*math.sin(2*math.pi*i/20)
            for index in [7,8,11,12,23,24]: p[index].x+=shift
            r=a.update(p,(640,480),i/10)
        self.assertEqual(r['items']['body_sway']['state'],'WARNING')
        p[23].visibility=.1
        r=a.update(p,(640,480),15.1)
        self.assertEqual(r['items']['body_sway']['state'],'UNAVAILABLE')
        self.assertFalse(r['items']['body_sway']['recovered'])

    def test_cooldown_expires_for_new_episode(self):
        r=TemporalRule(Config())
        for t in [0,1,2,3,4]: r.update(t,True)
        r.update(4.1,False); r.update(5.2,False)
        for t in [15,16,17]: x=r.update(t,True)
        self.assertEqual(x['events'][0]['type'],'CAUTION')

class EpisodeTests(unittest.TestCase):
    def test_bad_frame_immediately_after_recovery_starts_new_candidate(self):
        r=TemporalRule(Config())
        for t in [0,1,2,3,4]: r.update(t,True)
        r.update(4.1,False)
        self.assertEqual(r.update(5.2,False)['state'],'RECOVERED')
        x=r.update(5.3,True)
        self.assertEqual(x['state'],'CANDIDATE')
        self.assertEqual(x['duration_seconds'],0.)


if __name__=='__main__':
    unittest.main()
