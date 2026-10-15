import {streamSource,errorResponse} from '../media/source';
export async function GET(request:Request) {try {return await streamSource(Object.fromEntries(new URL(request.url).searchParams),request);} catch(e) {return errorResponse(e);}}

import {resolveSource} from '../media/source';
export async function HEAD(request:Request){try{const source=await resolveSource(Object.fromEntries(new URL(request.url).searchParams),request.headers.get('user-agent')||'');return new Response(null,{headers:{'Content-Length':String(source.size),'Accept-Ranges':'bytes','Content-Type':source.mime,'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
