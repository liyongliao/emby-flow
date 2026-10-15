import {serverBase,authHeaders,embyFetch,errorResponse,MediaError,id} from '../media/remote';
const route=/^(System\/Info\/Public|Users\/AuthenticateByName|Users\/[a-zA-Z0-9_-]+\/(Views|Items)(\/[a-zA-Z0-9_-]+)?|Shows\/[a-zA-Z0-9_-]+\/(Seasons|Episodes)|Items\/[a-zA-Z0-9_-]+\/PlaybackInfo|Sessions\/(Logout|Playing(\/(Progress|Stopped))?)|Videos\/ActiveEncodings)$/;
export async function POST(request:Request){try {
 const data=await request.json() as any;const path=String(data.path||'');const method=String(data.method||'GET');
 if(!route.test(path)||!['GET','POST','DELETE'].includes(method))throw new MediaError('不支持这个操作。');
 if(path==='Users/AuthenticateByName'&&method!=='POST')throw new MediaError('登录请求无效。');
 if(path==='System/Info/Public'&&method!=='GET')throw new MediaError('服务器信息请求无效。');
 if(!['Users/AuthenticateByName','System/Info/Public'].includes(path)&&!data.token)throw new MediaError('请先连接服务器。',401);
 const base=await serverBase(data.server);const url=new URL(path,base);const params=data.params||{};
 for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
 if(params.Limit&&Number(params.Limit)>200)throw new MediaError('每次最多读取 200 条记录。');
 const res=await embyFetch(url,{method,headers:authHeaders(data.token?id(data.token):'',String(data.device||'')),body:data.body?JSON.stringify(data.body):undefined,signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new MediaError(res.status===401?'账号密码错误或登录已过期。':res.status===403?'服务器未允许这个操作。':'Emby 请求失败（'+res.status+'）。',res.status);
 if(res.status===204)return new Response(null,{status:204});
 const text=await res.text();return new Response(text,{status:res.status,headers:{'Content-Type':res.headers.get('content-type')||'application/json','Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e)}}
