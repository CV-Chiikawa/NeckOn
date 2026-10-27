import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class DemoTests(unittest.TestCase):
    def test_help_without_camera(self):
        p=subprocess.run([sys.executable,'-m','interview_beta','--help'],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertIn('--source',p.stdout)
        self.assertIn('--headless',p.stdout)

    @unittest.skipUnless(importlib.util.find_spec('mediapipe') and importlib.util.find_spec('cv2'),'CV dependencies not installed')
    def test_blank_video_real_inference_and_jsonl(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as td:
            video=Path(td)/'blank.avi'; output=Path(td)/'out.jsonl'
            writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'MJPG'),10,(320,240))
            self.assertTrue(writer.isOpened())
            for _ in range(6): writer.write(np.zeros((240,320,3),dtype=np.uint8))
            writer.release()
            p=subprocess.run([sys.executable,'-m','interview_beta','--source',str(video),'--headless','--jsonl',str(output)],capture_output=True,text=True)
            self.assertEqual(p.returncode,0,p.stderr)
            rows=[json.loads(line) for line in output.read_text().splitlines()]
            self.assertEqual(len(rows),6)
            self.assertTrue(all(row['status']=='UNAVAILABLE' for row in rows))
            self.assertAlmostEqual(rows[-1]['timestamp'],.5)
            self.assertFalse(any(row['generated_events'] for row in rows))

    def test_bad_source_error(self):
        p=subprocess.run([sys.executable,'-m','interview_beta','--source','/definitely-missing.avi','--headless'],capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0)
        self.assertNotIn('Traceback',p.stderr)
