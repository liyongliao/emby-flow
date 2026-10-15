export const formatBytes=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';
export function safeFilename(name){return String(name||'video').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').slice(0,170)}
export function attachmentFilename(header){const encoded=header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];if(encoded){try{return decodeURIComponent(encoded)}catch{}}return header?.match(/filename="([^"]+)"/i)?.[1]||null}
export class DownloadQueue{
 constructor({sessionFor,changed,notify}){this.sessionFor=sessionFor;this.changed=changed;this.notify=notify;this.directory=null;this.running=false;this.paused=false;this.abort=null;this.active=null;this.lastNotify=0;try{this.jobs=JSON.parse(localStorage.getItem('flow-queue-v2')||'[]')}catch{this.jobs=[]}if(!Array.isArray(this.jobs))this.jobs=[];for(const job of this.jobs)if(job.status==='downloading'||job.status==='queued')job.status='paused';this.persist()}
 persist(){const stored=this.jobs.slice(0,500).map(({controller,...job})=>job);localStorage.setItem('flow-queue-v2',JSON.stringify(stored));this.changed?.(this)}
 get folderSupported(){return typeof window.showDirectoryPicker==='function'}
 async chooseFolder(){if(!this.folderSupported)throw Error('此浏览器不支持文件夹保存，请选择浏览器逐个保存。');this.directory=await window.showDirectoryPicker({mode:'readwrite'});this.changed(this);return this.directory}
 add(items,session,mode='folder'){let count=0;for(const item of items){if(this.jobs.some(j=>j.server===session.server&&j.user===session.user&&j.item===String(item.Id)&&['queued','downloading','paused'].includes(j.status)))continue;this.jobs.push({id:crypto.randomUUID(),item:String(item.Id),source:item.sourceId||'',server:session.server,user:session.user,username:session.name,profileId:session.profileId||'',name:item.SeriesName?`${item.SeriesName} - S${String(item.ParentIndexNumber||1).padStart(2,'0')}E${String(item.IndexNumber||0).padStart(2,'0')} - ${item.Name}`:item.Name,mode,status:'queued',bytes:0,total:0,time:Date.now()});count++}this.paused=false;this.persist();this.run();return count}
 pause(){this.paused=true;this.abort?.abort();this.persist()}
 resume(){this.paused=false;for(const j of this.jobs)if(j.status==='paused')j.status='queued';this.persist();this.run()}
 cancel(id){const j=this.jobs.find(x=>x.id===id);if(!j)return;if(j===this.active)this.abort?.abort();j.status='cancelled';this.persist()}
 retry(id){const j=this.jobs.find(x=>x.id===id);if(j){j.status='queued';j.error='';this.paused=false;this.persist();this.run()}}
 clearFinished(){this.jobs=this.jobs.filter(j=>['queued','downloading','paused'].includes(j.status));this.persist()}
 async browserDownload(job,data){const frame=document.createElement('iframe');frame.hidden=true;frame.name='download-'+job.id;frame.dataset.record=job.id;frame.title='下载响应';document.body.append(frame);const form=document.createElement('form');form.method='POST';form.action='/api/download';form.target=frame.name;for(const[k,v]of Object.entries(data)){const input=document.createElement('input');input.type='hidden';input.name=k;input.value=v;form.append(input)}document.body.append(form);form.submit();form.remove();job.status='submitted';this.persist();await new Promise(resolve=>setTimeout(resolve,2500))}
 async folderDownload(job,data){let writer=null,reader=null;const signal=this.abort.signal;try{
  let res=await fetch('/api/download',{method:'POST',body:new URLSearchParams(data),headers:job.bytes>0?{Range:'bytes='+job.bytes+'-'}:{},signal});
  if(res.status===401){await res.body?.cancel();const renewed=await this.sessionFor(job,true);data.token=renewed.token;res=await fetch('/api/download',{method:'POST',body:new URLSearchParams(data),headers:job.bytes>0?{Range:'bytes='+job.bytes+'-'}:{},signal});}
  if(!res.ok){const text=await res.text();let message='下载请求失败（'+res.status+'）';try{message=JSON.parse(text).error||message}catch{const match=text.match(/<p>([^<]+)<\/p>/);if(match)message=match[1]}throw Error(message)}
  const range=res.headers.get('content-range');const offset=range?Number(range.match(/bytes\s+(\d+)-/)?.[1]):0;
  if(job.bytes>0&&res.status===206&&offset!==job.bytes){await res.body.cancel();throw Error('视频源返回的续传位置不正确，请重新下载。')}
  job.total=Number(range?.split('/')[1])||Number(res.headers.get('content-length'))+(res.status===206?job.bytes:0)||0;
  const original=attachmentFilename(res.headers.get('content-disposition'))||job.name+'.mkv';const dot=original.match(/\.[a-z0-9]{2,5}$/i)?.[0]||'.mkv';job.filename=job.filename||safeFilename(job.name+' ['+job.item+']'+dot);
  const file=await this.directory.getFileHandle(job.filename,{create:true});const old=await file.getFile();
  const start=res.status===206?job.bytes:0;if(start>0&&old.size<start){await res.body.cancel();job.bytes=0;throw Error('本地文件与续传记录不一致，已重置位置，请重试。')}
  if(start===0&&job.total>0&&old.size===job.total){await res.body.cancel();job.bytes=old.size;job.status='done';return}
  writer=await file.createWritable({keepExistingData:start>0});if(start>0)await writer.seek(start);else{await writer.truncate(0);job.bytes=0}
  reader=res.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;if(signal.aborted)throw new DOMException('paused','AbortError');await writer.write(value);job.bytes+=value.byteLength;if(Date.now()-this.lastNotify>250){this.lastNotify=Date.now();this.persist()}}
  await writer.truncate(job.bytes);await writer.close();writer=null;if(job.total&&job.bytes!==job.total)throw Error('视频源提前断开，已保存文件片段，可以重试续传。');job.status='done';
 }catch(error){if(writer){try{await writer.truncate(job.bytes);await writer.close()}catch{}}try{await reader?.cancel()}catch{}if(signal.aborted){if(job.status!=='cancelled')job.status='paused'}else{job.status='error';job.error=error.message}}
 }
 async run(){if(this.running||this.paused)return;this.running=true;try{for(;;){if(this.paused)break;const job=this.jobs.find(j=>j.status==='queued');if(!job)break;if(job.mode==='folder'&&!this.directory){job.status='paused';this.notify('请先选择保存文件夹，然后继续队列。');this.persist();break}this.active=job;this.abort=new AbortController();job.status='downloading';this.persist();try{const session=await this.sessionFor(job);if(this.abort.signal.aborted)throw new DOMException('paused','AbortError');const data={server:job.server,token:session.token,user:session.user,item:job.item,source:job.source,name:job.name};if(job.mode==='browser')await this.browserDownload(job,data);else await this.folderDownload(job,data)}catch(e){if(job.status!=='cancelled'){job.status=this.abort.signal.aborted?'paused':'error';job.error=e.message}}this.persist();this.active=null;this.abort=null}}
 finally{this.running=false;this.active=null;this.abort=null;this.persist()}}
}
