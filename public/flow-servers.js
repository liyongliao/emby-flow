// Probe public server information before sending any account credentials.
export function serverCandidates(value) {
 const input=String(value||'').trim();
 if(!input||/\s/.test(input))throw Error('请输入有效的服务器域名或 IP 地址。');
 const explicit=/^https?:\/\//i.test(input);
 if(!explicit&&/^[a-z][a-z\d+.-]*:/i.test(input)&&!/^([^/:]+|\[[^\]]+\]):\d+(?:\/|$)/.test(input))throw Error('仅支持 HTTP 或 HTTPS 服务器。');
 let url;try{url=new URL(explicit?input:'https://'+input.replace(/^\/\//,''))}catch{throw Error('服务器地址格式无效。')}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname)throw Error('请输入有效的 HTTP/HTTPS 服务器地址，账号请填写在下方。');
 url.search='';url.hash='';
 url.pathname=url.pathname.replace(/\/web(?:\/.*)?$/i,'').replace(/\/+$/,'').replace(/\/emby$/i,'');
 const first=url.toString().replace(/\/$/,'');
 if(explicit)return [first];
 url.protocol='http:';return [first,url.toString().replace(/\/$/,'')];
}
export async function detectServer(value,request) {
 const candidates=serverCandidates(value);let lastError;
 for(const server of candidates){
  try{
   const info=await request(server);
   if(!info||typeof info.ServerName!=='string'||!info.ServerName.trim()||!info.Id||!info.Version)throw Error('该地址未返回有效的 Emby 服务器信息，请检查地址或反向代理路径。');
   return {server,name:info.ServerName.trim()};
  }catch(error){lastError=error}
 }
 throw Error('无法识别 Emby 服务器：'+(lastError?.message||'连接失败，请检查地址。'));
}
