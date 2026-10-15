import {serverBase,embyFetch,errorResponse,MediaError,id} from '../media/remote';
export async function GET(request:Request){try {
 const p=new URL(request.url).searchParams;const base=await serverBase(p.get('server'));const item=id(p.get('item'));const token=id(p.get('token'));const type=p.get('type')||'Primary';
 if(!['Primary','Backdrop','Thumb','Logo'].includes(type))throw new MediaError('图片参数无效。');
 const url=new URL(`Items/${item}/Images/${type}`,base);url.searchParams.set('api_key',token);url.searchParams.set('maxWidth',String(Math.min(1600,Math.max(80,Number(p.get('width'))||350))));url.searchParams.set('quality','80');if(p.get('tag'))url.searchParams.set('tag',p.get('tag')!);
 const res=await embyFetch(url,{signal:request.signal});if(!res.ok||!res.headers.get('content-type')?.startsWith('image/')){await res.body?.cancel();throw new MediaError('海报不存在。',404);}
 return new Response(res.body,{headers:{'Content-Type':res.headers.get('content-type')!,'Cache-Control':'private, max-age=3600','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 }catch(e){return errorResponse(e)}}
