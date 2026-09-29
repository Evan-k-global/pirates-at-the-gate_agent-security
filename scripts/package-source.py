"""Build a reproducible source download; never include credentials or runtime state."""
from pathlib import Path
import json,zipfile,hashlib
root=Path(__file__).resolve().parents[1]
excluded={'node_modules','.git','.wrangler','.sites-runtime','.agents','.codex','dist','.next','.vinext','private','cache','__pycache__','outputs','work','.playwright-mcp'}
target=root/'public/witness-source.zip'
files=[]
for p in root.rglob('*'):
    if not p.is_file() or p.is_symlink(): continue
    rel=p.relative_to(root)
    if any(part in excluded for part in rel.parts):continue
    if rel.parts[:2]==('proof','build'):continue
    if p.name.startswith('.env') or p.suffix in {'.pem','.key','.tsbuildinfo'} or p==target:continue
    files.append(p)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):
        rel=p.relative_to(root)
        if str(rel)=='.openai/hosting.json':data=json.dumps({'d1':'DB','r2':None},indent=2).encode()
        else:data=p.read_bytes()
        info=zipfile.ZipInfo('witness-demo/'+str(rel),date_time=(2026,9,29,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        z.writestr(info,data)
print(json.dumps({'file':str(target),'files':len(files),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
