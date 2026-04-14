import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sling.app',
  appName: 'Sling',
  webDir: 'dist',
  server: {
    url: 'https://ais-pre-jpjl6sl3ypg4jcpcon4egw-597038029842.asia-southeast1.run.app',
    cleartext: true
  }
};

export default config;
