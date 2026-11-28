import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'node:path'
const sources={
  "@signal-app/api": "../packages/api/src/index.ts",
  "@signal-app/arrange-editor": "../packages/arrange-editor/src/index.ts",
  "@signal-app/community": "../packages/community/src/index.tsx",
  "@signal-app/control-editor": "../packages/control-editor/src/index.ts",
  "@signal-app/core": "../packages/core/src/index.ts",
  "dialog-hooks": "../packages/dialog-hooks/src/index.ts",
  "@signal-app/event-list-editor": "../packages/event-list-editor/src/index.ts",
  "@signal-app/firebaseui-web-react": "../packages/firebaseui-web-react/src/index.tsx",
  "@signal-app/geometry": "../packages/geometry/src/index.ts",
  "@signal-app/observable": "../packages/observable/src/index.ts",
  "@signal-app/pianoroll-editor": "../packages/pianoroll-editor/src/index.ts",
  "@signal-app/player": "../packages/player/src/index.ts",
  "@signal-app/ruler-editor": "../packages/ruler-editor/src/index.ts",
  "@signal-app/tempo-editor": "../packages/tempo-editor/src/index.ts",
  "@signal-app/ui": "../packages/ui/src/index.ts",
  "@signal-app/velocity-editor": "../packages/velocity-editor/src/index.ts"
}
export default defineConfig({
  base:'./',
  plugins:[react(),svgr({include:'**/*.svg',svgrOptions:{plugins:['@svgr/plugin-svgo','@svgr/plugin-jsx'],exportType:'default'}})],
  resolve:{alias:Object.fromEntries(Object.entries(sources).map(([name,file])=>[name,path.resolve(__dirname,file)]))},
  define:{'process.env':{}},
  build:{rollupOptions:{input:path.resolve(__dirname,'edit.html')},outDir:path.resolve(__dirname,'../../..','material-atlas/dist/signal')}
})
