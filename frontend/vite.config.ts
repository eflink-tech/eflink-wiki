import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** 构建时写入 version.json，供已打开的页面轮询发现新版本 */
function wikiVersionPlugin(version: string): Plugin {
  return {
    name: 'wiki-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, builtAt: new Date().toISOString() }),
      })
    },
  }
}

const appVersion = process.env.WIKI_FRONTEND_VERSION || `${Date.now()}`

// Vite 配置：React + Tailwind CSS 4 插件
// 开发时将 /api 与 /uploads 代理到本地后端（不改写路径）
export default defineConfig({
  define: {
    'import.meta.env.WIKI_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [react(), tailwindcss(), wikiVersionPlugin(appVersion)],
  resolve: {
    // @eflink-tech/* 五个编辑器包通过 file: 软链引入，必须与主应用共用同一份
    // react/react-dom（否则 Invalid hook call）；zustand 去重防止包内文档 store
    // 与主应用分裂；konva/react-konva 被 draw 与 mindmap 共用，必须单实例；
    // lucide-react/dexie/echarts/openai/clsx/tailwind-merge 为多包各自解析的
    // 公共库，去重到根依赖同一份避免生产包打入多份（照抄 eflink-frontend 同款配置）
    dedupe: [
      'react',
      'react-dom',
      'zustand',
      'konva',
      'react-konva',
      'lucide-react',
      'dexie',
      'echarts',
      'openai',
      'clsx',
      'tailwind-merge',
    ],
  },
  server: {
    port: 5173,
    proxy: {
      // 后端默认端口 8090（本机 8080 常被开发用 nginx 占用）；可用 WIKI_API_PORT 覆盖
      '/api': {
        target: `http://127.0.0.1:${process.env.WIKI_API_PORT || '8090'}`,
        changeOrigin: true,
      },
      '/uploads': {
        target: `http://127.0.0.1:${process.env.WIKI_API_PORT || '8090'}`,
        changeOrigin: true,
      },
      // 实时协同 WebSocket（collab-server，默认 18080；可用 WIKI_COLLAB_PORT 覆盖）
      '/collab': {
        target: `ws://127.0.0.1:${process.env.WIKI_COLLAB_PORT || '18080'}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
