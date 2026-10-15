const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let keyPromise;
function vaultKey(){return keyPromise??=(async()=>{
 if(!crypto.subtle||!window.indexedDB)throw Error('此浏览器无法加密保存密码；仍可连接服务器。');
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('emby-flow-vault',1);req.onupgradeneeded=()=>req.result.createObjectStore('keys');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开本地密码存储。'))});
 const existing=await new Promise((resolve,reject)=>{const req=db.transaction('keys','readonly').objectStore('keys').get('key');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
 if(existing){db.close();return existing}
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 await new Promise((resolve,reject)=>{const tx=db.transaction('keys','readwrite');tx.objectStore('keys').put(key,'key');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return key;
 })()}
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function encryptPassword(password){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(),new TextEncoder().encode(password));return {iv:b64(iv),data:b64(data)}}
export async function decryptPassword(encrypted){if(!encrypted)return '';return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(encrypted.iv)},await vaultKey(),bytes(encrypted.data)))}
export function getProfiles(){const profiles=read('flow-profiles',[]);return Array.isArray(profiles)?profiles:[]}
export async function saveProfile({id,name,server,username,password,remember}){const list=getProfiles();const previous=list.find(x=>x.id===id||x.server===server&&x.username===username);const profile={id:previous?.id||id||crypto.randomUUID(),name:name||new URL(server).hostname,server,username,password:remember?await encryptPassword(password):null};const index=list.findIndex(x=>x.id===profile.id);if(index>=0)list[index]=profile;else list.push(profile);localStorage.setItem('flow-profiles',JSON.stringify(list));return profile}
export function removeProfile(id){localStorage.setItem('flow-profiles',JSON.stringify(getProfiles().filter(x=>x.id!==id)));if(localStorage.getItem('flow-last-profile')===id)localStorage.removeItem('flow-last-profile')}
export const readPreference=(key,fallback)=>read(key,fallback);
export function writePreference(key,value){localStorage.setItem(key,JSON.stringify(value))}
export function seasonKey(session,series){return `flow-season:${session.server}:${session.user}:${series}`}
export function positionKey(session,item){return `flow-position:${session.server}:${session.user}:${item}`}
