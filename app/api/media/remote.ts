export class MediaError extends Error { constructor(message: string, public status = 400) { super(message); } }
const dnsCache = new Map<string,number>();
export function publicAddress(address:string):boolean {
 const ip=address.toLowerCase().replace(/^\[|\]$/g,'');
 if(ip.includes(':')) {
  if(ip==='::'||ip==='::1'||/^f[cd]/.test(ip)||/^fe[89ab]/.test(ip)||ip.startsWith('ff')||ip.startsWith('2001:db8:'))return false;
  if(ip.includes('ffff:')) {const tail=ip.split('ffff:')[1];if(tail.includes('.'))return publicAddress(tail);return false;}
  return /^(2|3)[0-9a-f]{3}:/.test(ip);
 }
 const parts=ip.split('.').map(Number);if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const[a,b]=parts;return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));
}
export async function publicURL(raw:string|URL, base?:URL):Promise<URL> {
 let url:URL;try{url=new URL(String(raw),base)}catch{throw new MediaError('服务器或视频地址无效。');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new MediaError('请输入有效的公开 HTTP/HTTPS 服务器地址。');
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(!host||host==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(host)||( !host.includes('.')&&!host.includes(':')))throw new MediaError('在线版需要可公开访问的服务器地址。');
 if(/^[0-9.]+$/.test(host)||host.includes(':')) {if(!publicAddress(host))throw new MediaError('在线版无法连接局域网服务器。');return url;}
 if((dnsCache.get(host)||0)>Date.now())return url;
 const records=await Promise.all(['A','AAAA'].map(async(type)=>{
  const res=await fetch('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:host,type}),{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw new MediaError('服务器域名解析失败。',502);
  const data=await res.json() as {Answer?:Array<{type:number;data:string}>};return(data.Answer||[]).filter(x=>x.type===1||x.type===28).map(x=>x.data);
 }));
 const addresses=records.flat();if(!addresses.length||addresses.some(x=>!publicAddress(x)))throw new MediaError('服务器域名未解析到可用的公开地址。',502);
 if(dnsCache.size>500)dnsCache.clear();dnsCache.set(host,Date.now()+60000);return url;
}
export async function serverBase(value:unknown) {
 const base=await publicURL(String(value||''));base.search='';base.hash='';base.pathname=base.pathname.replace(/\/$/,'').replace(/\/emby$/i,'')+'/emby/';return base;
}
export function authHeaders(token:string,device='emby-flow-web'):Record<string,string> {
 return {'Content-Type':'application/json','X-Emby-Authorization':`Emby Client="Emby Flow", Device="Browser", DeviceId="${device.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)}", Version="2.0.0"`,...(token?{'X-Emby-Token':token}:{})};
}
export function id(value:unknown,optional=false){const s=String(value||'');if(!new RegExp('^[a-zA-Z0-9_-]{'+(optional?0:1)+',200}$').test(s))throw new MediaError('媒体参数无效。');return s;}
export async function embyFetch(url:URL,init:RequestInit) {
 for(let i=0;i<4;i++) {
  const res=await fetch(url,{...init,redirect:'manual'});
  if(res.status<300||res.status>=400)return res;
  const location=res.headers.get('location');await res.body?.cancel();if(!location)throw new MediaError('服务器跳转无效。',502);
  const next=await publicURL(location,url);if(next.hostname!==url.hostname)throw new MediaError('服务器跳转到了其他域名，请直接保存最终服务器地址。',502);url=next;
 }
 throw new MediaError('服务器跳转次数过多。',502);
}
export function errorResponse(error:unknown) {
 const status=error instanceof MediaError?error.status:502;
 return Response.json({error:error instanceof MediaError?error.message:'连接超时或失败，请稍后重试。'},{status,headers:{'Cache-Control':'no-store'}});
}
