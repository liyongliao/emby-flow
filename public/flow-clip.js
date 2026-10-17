const MiB=1024**2;
export const MEMORY_LIMIT=192*MiB;
export function parseClipTime(value){
 const text=String(value).trim();
 if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text))throw Error('时间格式应为 时:分:秒，例如 00:12:30.500。');
 const parts=text.split(':').map(Number);
 if(parts.slice(1).some(n=>n>=60))throw Error('时间中的分、秒应小于 60。');
 const seconds=parts.reduce((n,x)=>n*60+x,0);
 if(!Number.isFinite(seconds))throw Error('时间无效。');return seconds;
}
export function formatClipTime(seconds){
 const ms=Math.max(0,Math.round(Number(seconds||0)*1000));
 return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');
}
export function validateClipRange(start,end,duration){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('结束时间必须晚于开始时间。');
 if(Number.isFinite(duration)&&duration>0&&end>duration+0.05)throw Error('结束时间超出了视频时长。');
 if(end-start<0.1)throw Error('请选择至少 0.1 秒的片段。');
 return {start,end};
}
export function clipFilename(name,start,end,format='mp4'){
 return String(name||'视频').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').slice(0,100)+'_'+formatClipTime(start).replaceAll(':','-')+'_'+formatClipTime(end).replaceAll(':','-')+'.'+format;
}
function canceled(signal){if(signal?.aborted)throw new DOMException('已取消片段导出。','AbortError')}
export async function readClipRange(url,start,end,{signal,fetchFn=fetch,total}={}){
 canceled(signal);
 const res=await fetchFn(url,{headers:{Range:`bytes=${start}-${end-1}`},cache:'no-store',signal});
 const range=res.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
 if(res.status!==206||!range||Number(range[1])!==start||Number(range[2])!==end-1||(total&&Number(range[3])!==total)){
  await res.body?.cancel();
  throw Error(res.status===401?'登录已过期，请重新连接后导出。':'视频源未正确支持分段读取，已停止导出，避免下载整部视频。');
 }
 const size=Number(range[3]);if(!Number.isSafeInteger(size)||size<end){await res.body?.cancel();throw Error('视频源大小无效。')}
 const result=new Uint8Array(end-start);let offset=0;
 const reader=res.body?.getReader();if(!reader)throw Error('视频源没有返回数据。');
 try{for(;;){canceled(signal);const {done,value}=await reader.read();if(done)break;if(offset+value.length>result.length)throw Error('视频源返回的数据超过请求范围，已停止导出。');result.set(value,offset);offset+=value.length}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 if(offset!==result.length)throw Error('片段数据提前中断，请重试。');
 return {data:result,size};
}
export function createClipReader(url,{signal,fetchFn=fetch,onRead=()=>{},blockSize=MiB}={}){
 let size=0,bytes=0,budget=32*MiB;const cache=new Map();let serial=Promise.resolve();
 const read=async(start,end)=>{
  canceled(signal);if(!size)throw Error('尚未读取视频索引。');
  if(end-start>32*MiB)throw Error('片源需要读取过大的索引或数据块，暂不支持节省流量的片段导出。');
  const result=new Uint8Array(end-start);
  for(let pos=start;pos<end;){
   const from=Math.floor(pos/blockSize)*blockSize,to=Math.min(size,from+blockSize);
   let block=cache.get(from);
   if(!block){
    if(bytes+to-from>budget)throw Error('片源索引缺失或读取量过大，已停止以避免下载整部视频。可尝试其他版本。');
    const response=await readClipRange(url,from,to,{signal,fetchFn,total:size});block=response.data;bytes+=block.length;
    cache.set(from,block);if(cache.size>8)cache.delete(cache.keys().next().value);onRead(bytes);
   }
   const count=Math.min(end,to)-pos;result.set(block.subarray(pos-from,pos-from+count),pos-start);pos+=count;
  }return result;
 };
 return {
  async getSize(){if(!size){const response=await readClipRange(url,0,2,{signal,fetchFn});size=response.size;bytes+=2;onRead(bytes)}return size},
  // One upstream request at a time, even when audio and video request overlapping blocks.
  read(start,end){const task=serial.then(()=>read(start,end));serial=task.catch(()=>{});return task},
  allowMedia(duration,start,end){budget=Math.max(32*MiB,Math.min(size*2,64*MiB+size*Math.min(1,(end-start)/duration)*4))},
  get bytes(){return bytes},
  clear(){cache.clear()}
 };
}
/** Remux indexed ranges. The library is lazy-loaded and no decoder/transcoder is used. */
export async function exportClip({url,start,end,duration,format='mp4',fileHandle,signal,onProgress=()=>{},fetchFn=fetch,blockSize=MiB}){
 validateClipRange(start,end,duration);if(!['mp4','mkv'].includes(format))throw Error('不支持的片段格式。');
 canceled(signal);const m=await import('./mediabunny/mediabunny.mjs');canceled(signal);
 let input,output,conversion,writer,outputSize=0,storedBytes=0,progress=0;const chunks=[];
 const report=(phase,extra={})=>onProgress({phase,progress,readBytes:reader.bytes,outputBytes:outputSize,...extra});
 const reader=createClipReader(url,{signal,fetchFn,blockSize,onRead:()=>report('reading')});
 const abort=()=>{input?.dispose();void conversion?.cancel().catch(()=>{})};signal?.addEventListener('abort',abort,{once:true});
 try{
  report('index');
  input=new m.Input({formats:[m.MP4,m.MATROSKA,m.WEBM,m.QTFF],source:new m.CustomSource({getSize:reader.getSize,read:reader.read,maxCacheSize:8*MiB,prefetchProfile:'none'})});
  const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
  if(!video)throw Error('片源没有可用的视频轨道，暂不支持片段导出。');
  const knownDuration=await input.getDurationFromMetadata();
  const totalDuration=knownDuration||duration;if(!Number.isFinite(totalDuration)||totalDuration<=0)throw Error('片源没有可用的时长索引，暂不支持片段导出。');
  validateClipRange(start,end,totalDuration);
  let actualStart=start;
  if(format==='mkv'){
   const key=await new m.EncodedPacketSink(video).getKeyPacket(start,{metadataOnly:true});
   if(!key)throw Error('没有找到起点附近的关键帧，请调整开始时间。');
   actualStart=Math.max(0,key.timestamp);
  }
  canceled(signal);
  if(fileHandle)writer=await fileHandle.createWritable();
  const target=new m.StreamTarget(new WritableStream({async write({data,position}){
   canceled(signal);outputSize=Math.max(outputSize,position+data.byteLength);
   if(writer)await writer.write({type:'write',position,data});
   else{storedBytes+=data.byteLength;if(storedBytes>MEMORY_LIMIT||outputSize>MEMORY_LIMIT)throw Error('此浏览器的片段缓存已达 192 MB，请缩短片段，或使用支持直接保存文件的桌面 Chrome / Edge。');chunks.push({position,data:data.slice()})}
  }}),{chunked:true,chunkSize:MiB});
  output=new m.Output({format:format==='mkv'?new m.MkvOutputFormat():new m.Mp4OutputFormat({fastStart:false}),target});
  conversion=await m.Conversion.init({input,output,tracks:'primary',trim:{start:actualStart,end},copy:{mode:'forced',shiftTolerance:format==='mkv'?Infinity:0,boundaryPolicy:'expand'},tags:{},showWarnings:false});
  // Do not silently export a silent clip when its original audio cannot be copied.
  if(!conversion.isValid||!conversion.utilizedTracks.includes(video)||(audio&&!conversion.utilizedTracks.includes(audio)))throw Error('当前视频或默认音轨无法无损写入此格式，请切换 MP4 / MKV 或选择其他视频版本。');
  canceled(signal);reader.allowMedia(knownDuration||duration,actualStart,end);report('export',{actualStart});
  conversion.onProgress=p=>{progress=Math.min(.99,Math.max(0,p));report('export',{actualStart})};
  await conversion.execute();canceled(signal);report('finalize',{actualStart});
  let blob=null;
  if(writer){await writer.truncate(outputSize);canceled(signal);await writer.close();writer=null}
  else{const data=new Uint8Array(outputSize);for(const chunk of chunks)data.set(chunk.data,chunk.position);blob=new Blob([data],{type:format==='mkv'?'video/x-matroska':'video/mp4'})}
  progress=1;report('done',{actualStart});return {blob,size:outputSize,readBytes:reader.bytes,actualStart,end};
 }catch(error){if(signal?.aborted)throw new DOMException('已取消片段导出。','AbortError');throw error}
 finally{
  signal?.removeEventListener('abort',abort);
  input?.dispose();if(conversion&&conversion.state!=='done')await conversion.cancel().catch(()=>{});else if(output&&output.state!=='finalized')await output.cancel().catch(()=>{});
  if(writer)await writer.abort().catch(()=>{});reader.clear();chunks.length=0;
 }
}
