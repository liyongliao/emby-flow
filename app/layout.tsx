import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Emby Flow · 播放与下载',description:'自己的媒体库，随时播放，轻松带走。',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
