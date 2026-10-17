import {clipRange,matchesClipRange} from '../../../lib/clip-range.mjs';
import {publicURL,serverBase,authHeaders,embyFetch,MediaError,id,errorResponse} from './remote';
export {errorResponse,MediaError} from './remote';
export const profile={Name:'Emby Flow Source',MaxStreamingBitrate:160000000,DirectPlayProfiles:[{Container:'mp4,m4v,mkv,webm',VideoCodec:'h264,hevc,vp8,vp9,av1',AudioCodec:'aac,mp3,opus,vorbis,ac3,eac3,dts,truehd',Type:'Video'}],TranscodingProfiles:[]};
async function parseInput(input:Record<string,unknown>){return {base:await serverBase(input.server),item:id(input.item),source:id(input.source,true),token:id(input.token),user:id(input.user)};}
const sourceCache=new Map<string,{time:number,value:any}>();
export async function resolveSource(input: Record<string,unknown>, ua: string) {
  const p = await parseInput(input);
  const cacheKey=[p.base.toString(),p.token,p.user,p.item,p.source,ua].join("|");
  const cached=sourceCache.get(cacheKey);if(!input.refresh&&cached&&Date.now()-cached.time<45000)return cached.value;
  const auth = authHeaders(p.token);
  const res = await embyFetch(new URL('Items/'+p.item+'/PlaybackInfo',p.base), {method:'POST', headers:auth, body:JSON.stringify({UserId:p.user,MediaSourceId:p.source||undefined,IsPlayback:false,EnableDirectPlay:true,EnableDirectStream:true,EnableTranscoding:false,DeviceProfile:profile}),signal:AbortSignal.timeout(25000)});
  if (!res.ok) throw new MediaError(res.status===401?'登录已过期，请重新连接。':'播放接口返回错误（'+res.status+'）。',res.status===401?401:502);
  const info = await res.json() as any;
  const source = (info.MediaSources || []).find((s:any)=>!p.source || s.Id===p.source);
  if (!source) throw new MediaError('这个视频没有可用的播放源。',404);
  let raw = source.DirectStreamUrl;
  if (!raw && source.Protocol==='Http' && source.Path) raw=source.Path;
  if (!raw) raw='Videos/'+p.item+'/stream?Static=true&MediaSourceId='+encodeURIComponent(source.Id);
  let url=await publicURL(raw,p.base);
  if (url.hostname===p.base.hostname && !url.searchParams.has('api_key')) url.searchParams.set('api_key',p.token);
  const required = source.RequiredHttpHeaders || {};
  const headers:Record<string,string> = {'User-Agent':required['User-Agent']||required['user-agent']||ua||'Mozilla/5.0'};
  for (const key of ['Referer','Origin']) if(required[key]) headers[key]=required[key];
  let size=0;let mime='application/octet-stream';let filename='';
  for(let n=0;n<6;n++) {
    const probe=await fetch(url,{headers:{...headers,Range:'bytes=0-0'},redirect:'manual',signal:AbortSignal.timeout(30000)});
    if(probe.status>=300&&probe.status<400) {
      const loc=probe.headers.get('location');await probe.body?.cancel();
      if(!loc) throw new MediaError('视频跳转没有返回地址。',502);
      url=await publicURL(loc,url);continue;
    }
    if(!probe.ok) {await probe.body?.cancel();throw new MediaError('视频源暂时不可用（'+probe.status+'），请重新获取链接。',502);}
    const range=probe.headers.get('content-range');size=Number(range?.split('/')[1] || (probe.status===200?probe.headers.get('content-length'):0))||Number(source.Size)||0;
    mime=probe.headers.get('content-type')||mime;filename=probe.headers.get('content-disposition')||'';await probe.body?.cancel();
    const value={url:url.toString(),size,mime,filename,headers,source,playSessionId:info.PlaySessionId};
    if(sourceCache.size>80)sourceCache.clear();sourceCache.set(cacheKey,{time:Date.now(),value});return value;
  }
  throw new MediaError('视频源的跳转次数过多。',502);
}
export async function streamSource(input: Record<string,unknown>,request:Request,download=false) {
  let partial:null|{start:number,end:number}=null;
  if(input.clip==='1'){try{partial=clipRange(request.headers.get('range'))}catch(e){throw new MediaError((e as Error).message,400)}}
  const resolved=await resolveSource(input,request.headers.get('user-agent')||'');
  const headers:Record<string,string>={...resolved.headers};
  const range=request.headers.get('range');if(range) headers.Range=range;
  const upstream=await fetch(resolved.url,{headers,signal:request.signal,redirect:'manual'});
  if(partial&&!matchesClipRange(upstream,partial)){await upstream.body?.cancel();throw new MediaError('视频源未正确支持分段读取，已停止导出。',422)}
  if(!upstream.ok) {await upstream.body?.cancel();throw new MediaError('文件请求失败（'+upstream.status+'），请重试。',502);}
  const out=new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  for(const key of ['content-length','content-range','accept-ranges','content-type']) {const value=upstream.headers.get(key);if(value)out.set(key,value);}
  if(!out.has('accept-ranges'))out.set('accept-ranges','bytes');
  const sourceExtension=String(resolved.source.DirectStreamUrl||'').split('?')[0].match(/\.(mp4|mkv|webm|avi|mov|m4v|ts)$/i)?.[1];
  const ext=String(sourceExtension||resolved.source.Container||'mkv').replace(/[^a-z0-9]/gi,'').toLowerCase();
  if(out.get('content-type')?.includes('octet-stream')&&!download)out.set('content-type',ext==='mp4'?'video/mp4':ext==='webm'?'video/webm':'video/x-matroska');
  if(download) {
    const name=String(input.name||'video').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').slice(0,150);
    const file=/\.(mkv|mp4|webm|avi|mov|m4v|ts)$/i.test(name)?name:name+'.'+(ext==='strm'?'mkv':ext);
    out.set('Content-Disposition',"attachment; filename=\"video."+(ext==='strm'?'mkv':ext)+"\"; filename*=UTF-8''"+encodeURIComponent(file));
  }
  return new Response(upstream.body,{status:upstream.status,headers:out});
}
