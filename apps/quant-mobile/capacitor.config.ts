import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quant.app',
  appName: 'Quant',
  webDir: 'dist',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    SplashScreen: { launchAutoHide: true, launchFadeOutDuration: 300 },
    Keyboard: { resize: 'body', style: 'dark' },
  },
};

export default config;
