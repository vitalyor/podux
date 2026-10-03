#!/usr/bin/python3
import json,subprocess,time,pathlib
root=pathlib.Path('/run/podux-watchdog');root.mkdir(mode=0o700,exist_ok=True)
for name in ['podux-frpc','podux']:
 r=subprocess.run(['docker','inspect','--format','{{json .State}}',name],capture_output=True,text=True)
 if r.returncode: continue
 state=json.loads(r.stdout)
 if not state.get('Running') or state.get('Health',{}).get('Status')!='unhealthy':continue
 last=root/name
 if last.exists() and time.time()-last.stat().st_mtime<300: continue
 subprocess.run(['docker','restart',name],check=True,stdout=subprocess.DEVNULL)
 last.touch(mode=0o600)
 print('Restarted unhealthy container:',name)
