#!/usr/bin/python3
import pathlib,sqlite3,tarfile,tempfile,os,time
source=pathlib.Path('/DATA/AppData/podux/data')
root=pathlib.Path('/root/podux-backups');root.mkdir(mode=0o700,exist_ok=True)
stamp=time.strftime('%Y%m%d-%H%M%S')
nextfile=root/(stamp+'.tgz.next');final=root/(stamp+'.tgz')
with tempfile.TemporaryDirectory(dir=root) as temporary:
 shadow=pathlib.Path(temporary)
 for name in ['data.db','auxiliary.db']:
  if (source/name).exists():
   src=sqlite3.connect('file:'+str(source/name)+'?mode=ro',uri=True)
   dst=sqlite3.connect(shadow/name)
   try: src.backup(dst)
   finally:dst.close();src.close()
 with tarfile.open(nextfile,'w:gz') as tar:
  for file in source.iterdir():
   if file.name.endswith(('.db','.db-wal','.db-shm')): continue
   tar.add(file,arcname=file.name)
  for file in shadow.iterdir():tar.add(file,arcname=file.name)
  tar.add('/var/lib/casaos/apps/podux/docker-compose.yml',arcname='deployment/compose.yaml')
  tar.add('/DATA/AppData/podux/.env',arcname='deployment/.env')
 os.chmod(nextfile,0o600);nextfile.rename(final)
 for old in sorted(root.glob('*.tgz'),reverse=True)[7:]:old.unlink()
print('Backup saved:',final)
