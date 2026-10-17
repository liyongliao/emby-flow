import {parseClipTime,formatClipTime,validateClipRange,clipFilename,exportClip} from './flow-clip.js';
import {formatBytes} from './flow-queue.js';
export function setupClipUI({getContext,position,duration,seek,pause,notify}){
 const $=id=>document.getElementById(id);let key='',job=null,objectURL=null,initialized=false;
 const controls=['clipStart','clipEnd','clipStartRange','clipEndRange','clipMarkStart','clipMarkEnd','clipPreview','clipFormat','clipExport'];
 function release(){if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;$('clipSave').hidden=true;$('clipSave').removeAttribute('href')}
 function busy(value){controls.forEach(id=>$(id).disabled=value);$('clipCancel').hidden=!value;$('clipExport').textContent=value?'正在导出…':'↓ 导出所选片段'}
 function message(text,error=false){$('clipStatus').textContent=text;$('clipStatus').classList.toggle('clip-error',error)}
 function values(){const start=parseClipTime($('clipStart').value),end=parseClipTime($('clipEnd').value);return validateClipRange(start,end,duration())}
 function update(){
  try{const {start,end}=values();$('clipStartRange').value=start;$('clipEndRange').value=end;$('clipLength').textContent='已选 '+(end-start).toFixed(1)+' 秒';$('clipExport').disabled=!!job;$('clipPreview').disabled=!!job}
  catch(e){$('clipLength').textContent=e.message;$('clipExport').disabled=true;$('clipPreview').disabled=true}
 }
 function setRange(start,end){$('clipStart').value=formatClipTime(start);$('clipEnd').value=formatClipTime(end);update()}
 function sync(){
  const context=getContext();const next=context?JSON.stringify(context.input):'';
  if(key===next)return;close();key=next;initialized=false;const total=duration()||0,start=Math.max(0,Math.min(position(),total-.1));
  $('clipStartRange').max=total;$('clipEndRange').max=total;setRange(start,Math.min(total,start+30));
 }
 function close(){job?.abort();release();$('clipPanel').hidden=true;$('clipToggle').setAttribute('aria-expanded','false');$('clipProgress').hidden=true;message('');key=''}
 $('clipToggle').onclick=()=>{
  sync();const opening=$('clipPanel').hidden;$('clipPanel').hidden=!opening;$('clipToggle').setAttribute('aria-expanded',String(opening));
  if(opening){const total=duration();if(!initialized&&total>0){const start=Math.max(0,Math.min(position(),total-.1));setRange(start,Math.min(total,start+30));initialized=true;}$('clipStartRange').max=total;$('clipEndRange').max=total;if(!total)message('正在读取视频时长，请稍候再打开片段下载。',true);update();$('clipPanel').scrollIntoView({block:'nearest',behavior:'smooth'})}
 };
 $('clipStart').oninput=update;$('clipEnd').oninput=update;
 for(const side of ['Start','End']){
  $('clip'+side+'Range').oninput=()=>{$('clip'+side).value=formatClipTime(Number($('clip'+side+'Range').value));update()};
  $('clip'+side+'Range').onchange=()=>{const n=Number($('clip'+side+'Range').value);seek(Math.min(n,Math.max(0,duration()-.05)))};
 }
 $('clipMarkStart').onclick=()=>{let end;try{end=parseClipTime($('clipEnd').value)}catch{end=0}const start=Math.min(position(),Math.max(0,duration()-.1));setRange(start,end>start?end:Math.min(duration(),start+30))};
 $('clipMarkEnd').onclick=()=>{let start;try{start=parseClipTime($('clipStart').value)}catch{start=0}const end=position();setRange(start<end?start:Math.max(0,end-30),end)};
 $('clipPreview').onclick=()=>{try{seek(values().start)}catch(e){message(e.message,true)}};
 $('clipCancel').onclick=()=>{job?.abort();message('正在取消…')};
 $('clipExport').onclick=async()=>{
  if(job)return;let range;try{range=values()}catch(e){message(e.message,true);return}
  const context=getContext();if(!context)return;
  const total=duration(),format=$('clipFormat').value,name=clipFilename(context.name,range.start,range.end,format);
  const controller=new AbortController();job=controller;busy(true);release();$('clipProgress').hidden=false;$('clipProgress').value=0;message('选择保存位置…');
  try{
   // Open the picker inside the click's user activation, before any network requests.
   const fileHandle=typeof window.showSaveFilePicker==='function'?await window.showSaveFilePicker({suggestedName:name,types:[{description:format.toUpperCase()+' 视频',accept:{[format==='mkv'?'video/x-matroska':'video/mp4']:['.'+format]}}]}):null;
   if(controller.signal.aborted)throw new DOMException('已取消','AbortError');
   pause();message('读取索引并定位片段…');
   const url=new URL('/api/stream?'+new URLSearchParams({...context.input,clip:'1'}),location.origin).toString();
   const result=await exportClip({url,...range,duration:total,format,fileHandle,signal:controller.signal,onProgress:p=>{
    if(job!==controller)return;$('clipProgress').value=p.progress;
    const stage=p.phase==='finalize'?'正在写入文件索引':p.phase==='index'?'定位视频片段':p.phase==='done'?'片段已完成':'正在读取并封装片段';
    message(stage+' · 已读取 '+formatBytes(p.readBytes)+' · 已生成 '+formatBytes(p.outputBytes));
   }});
   if(job!==controller||controller.signal.aborted)return;
   if(result.blob){objectURL=URL.createObjectURL(result.blob);$('clipSave').href=objectURL;$('clipSave').download=name;$('clipSave').hidden=false;$('clipSave').textContent='保存片段（'+formatBytes(result.size)+'）';$('clipSave').click()}
   message((fileHandle?'片段已保存':'片段已生成，请在浏览器中完成保存')+' · '+formatBytes(result.size)+' · 读取 '+formatBytes(result.readBytes)+(format==='mkv'?' · 实际起点 '+formatClipTime(result.actualStart):''));notify('片段导出完成。');
  }catch(e){if(controller.signal.aborted||e.name==='AbortError')message('已取消片段导出。');else message(e.message||'片段导出失败，请尝试其他版本。',true)}
  finally{if(job===controller){job=null;busy(false);update()}}
 };
 return {sync,close,dispose:close};
}
