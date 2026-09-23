import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = path.resolve(__dirname, 'src/locales')
const VIRTUAL_PREFIX = 'virtual:locale-bundle/'
const RESOLVED_PREFIX = '\0' + VIRTUAL_PREFIX

// 브라우저가 언어당 최대 18개(namespace별) HTTP 요청을 각각 보내던 것을 1개로
// 줄이기 위한 것. 원본 namespace JSON 파일(src/locales/{lang}/*.json)은 전혀
// 건드리지 않고 그대로 둔 채, 빌드/dev 서버가 요청을 받을 때 언어별로
// { namespace: 내용 } 형태 virtual module 하나로 묶어 내려준다 — src/i18n/config.ts
// 의 커스텀 백엔드 로더만 이 module을 언어당 1번 import하도록 바뀐다.
function localeBundlePlugin(): Plugin {
  return {
    name: 'locale-bundle',
    resolveId(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) return '\0' + id
    },
    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return
      const lang = id.slice(RESOLVED_PREFIX.length)
      const dir = path.join(LOCALES_DIR, lang)
      const bundle: Record<string, unknown> = {}
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue
        const filePath = path.join(dir, file)
        this.addWatchFile(filePath)
        bundle[file.slice(0, -'.json'.length)] = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }
      return `export default ${JSON.stringify(bundle)}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localeBundlePlugin()],
  server: {
    host: true,
  },
})
