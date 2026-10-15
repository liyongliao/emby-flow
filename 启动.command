#!/bin/zsh
cd -- "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print '需要安装 Node.js 22.13 或更新版本：https://nodejs.org/'
  read -k 1 '?按任意键退出'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
(
  for attempt in {1..60}; do
    if curl --silent --fail http://127.0.0.1:8787 >/dev/null; then
      open http://127.0.0.1:8787
      break
    fi
    sleep 1
  done
) &
npm run dev -- --port 8787
