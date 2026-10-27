"""Run: python -m interview_beta --source 0 --jsonl results.jsonl"""
import argparse
from contextlib import ExitStack
import json
from pathlib import Path
import sys
import time

from .analyzer import InterviewAnalyzer, ISSUES
from .config import Config


def parser():
    p=argparse.ArgumentParser(description='Offline interview posture Beta (heuristic 2D analysis)')
    p.add_argument('--source',default='0',help='Camera index or recorded video path')
    p.add_argument('--config',type=Path,help='JSON overrides for Beta heuristic settings')
    p.add_argument('--jsonl',type=Path,help='Write each analyzed frame as JSON Lines')
    p.add_argument('--headless',action='store_true',help='Process without an OpenCV window')
    p.add_argument('--mirror',action='store_true',help='Mirror display only; analysis directions remain unmirrored')
    p.add_argument('--max-frames',type=int,help='Stop after this many frames')
    p.add_argument('--fps',type=float,help='Video timestamp FPS override if metadata is incorrect')
    return p


def render(frame, result, cv2):
    colors={'WARNING':(70,70,255),'CAUTION':(30,210,255),'NORMAL':(70,230,70)}
    # A dedicated panel keeps text readable at any source resolution.
    import numpy as np
    panel=np.zeros((max(frame.shape[0],560),620,3),dtype=frame.dtype)
    lines=[('INTERVIEW BETA | '+result['status'],result['status'])]
    for key in ISSUES:
        f=result['features'][key]; item=result['items'][key]
        val='N/A' if f['value'] is None else f"{f['value']:+.2f} {f['unit']}"
        lines.append((key+': '+item['state'],item['state']))
        lines.append((val+(' | '+f['direction'] if f['direction'] else ''),'INFO'))
    lines.append(('Beta heuristics | 2D image features','INFO'))
    lines.append(('Q / ESC: quit | R: reset history','INFO'))
    y=27
    for text,state in lines:
        cv2.putText(panel,text,(12,y),cv2.FONT_HERSHEY_SIMPLEX,.53,colors.get(state,(225,225,225)),1,cv2.LINE_AA)
        y+=27
    for key in result['active_posture_issues']:
        cv2.putText(panel,result['items'][key]['feedback'],(12,y),cv2.FONT_HERSHEY_SIMPLEX,.5,(30,210,255),1,cv2.LINE_AA)
        y+=24
    if result['guidance']:
        for line in ('Show both ears, shoulders and hips.','Face a fixed, level camera.', 'Sway needs 4 seconds of visible body.'):
            cv2.putText(panel,line,(12,y),cv2.FONT_HERSHEY_SIMPLEX,.5,(200,200,200),1,cv2.LINE_AA); y+=24
    canvas=np.zeros((max(panel.shape[0],frame.shape[0]),frame.shape[1]+620,3),dtype=frame.dtype)
    canvas[:frame.shape[0],:frame.shape[1]]=frame
    canvas[:panel.shape[0],frame.shape[1]:]=panel
    return canvas


def run(args):
    if args.max_frames is not None and args.max_frames<=0:
        raise ValueError('--max-frames must be positive')
    if args.fps is not None and (not 0<args.fps<1000):
        raise ValueError('--fps must be in (0,1000)')
    cfg=Config.load(args.config) if args.config else Config()
    camera=args.source.isdecimal()
    if not camera and not Path(args.source).is_file():
        raise ValueError(f'Video file not found: {args.source}')
    try:
        import cv2
        import mediapipe as mp
    except ImportError as exc:
        raise RuntimeError('Install dependencies with Python 3.11: pip install -r requirements.txt') from exc
    if not hasattr(mp,'solutions'):
        raise RuntimeError('This Beta needs MediaPipe Solutions; use requirements.txt in a separate venv.')
    analyzer=InterviewAnalyzer(cfg)
    with ExitStack() as stack:
        cap=cv2.VideoCapture(int(args.source) if camera else args.source)
        stack.callback(cap.release)
        if not cap.isOpened():
            raise RuntimeError(f'Cannot open source: {args.source}. Check camera permission/index or codec.')
        if not args.headless: stack.callback(cv2.destroyAllWindows)
        output=stack.enter_context(args.jsonl.open('w',encoding='utf-8')) if args.jsonl else None
        # Complexity 1 uses the full model bundled with the pinned Solutions wheel.
        pose=stack.enter_context(mp.solutions.pose.Pose(model_complexity=1,
            smooth_landmarks=True,min_detection_confidence=.5,min_tracking_confidence=.5))
        fps=args.fps or cap.get(cv2.CAP_PROP_FPS)
        if not camera and not (0<fps<1000):
            raise ValueError('Invalid video FPS metadata: supply --fps explicitly')
        started=time.monotonic(); count=0
        while True:
            ok,frame=cap.read()
            if not ok:
                if camera or count==0:
                    raise RuntimeError('Could not read a frame from the source')
                break
            timestamp=time.monotonic()-started if camera else count/fps
            result=pose.process(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
            landmarks=result.pose_landmarks.landmark if result.pose_landmarks else None
            report=analyzer.update(landmarks,(frame.shape[1],frame.shape[0]),timestamp)
            if output:
                output.write(json.dumps(report,ensure_ascii=False,allow_nan=False)+'\n')
            for event in report['generated_events']:
                print(json.dumps(event,ensure_ascii=False),flush=True)
            count+=1
            if not args.headless:
                if result.pose_landmarks:
                    mp.solutions.drawing_utils.draw_landmarks(frame,result.pose_landmarks,mp.solutions.pose.POSE_CONNECTIONS)
                if args.mirror: frame=cv2.flip(frame,1)
                cv2.imshow('Interview Posture Beta',render(frame,report,cv2))
                key=cv2.waitKey(1 if camera else max(1,round(1000/fps))) & 0xff
                if key in (27,ord('q')): break
                if key==ord('r'): analyzer=InterviewAnalyzer(cfg)
            if args.max_frames and count>=args.max_frames: break
        print(f'Processed {count} frames.',file=sys.stderr)
    return 0


def main():
    args=parser().parse_args()
    try:
        return run(args)
    except (ValueError,RuntimeError,OSError,TypeError) as exc:
        print(f'Interview Beta: {exc}',file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__=='__main__':
    raise SystemExit(main())
