import type { CapacitorConfig } from '@capacitor/cli'

// webDir dist, base './' (vite.config.ts) — одна и та же сборка идёт и на GitHub Pages, и в APK.
const config: CapacitorConfig = {
  appId: 'com.enikey.musim',
  appName: 'Алик, где деньги?',
  webDir: 'dist',
}

export default config
