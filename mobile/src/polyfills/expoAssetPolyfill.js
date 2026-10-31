import { NativeModules } from 'react-native';

// Polyfill ExpoAsset native module if not present in the current runtime/client
if (typeof globalThis !== 'undefined') {
  globalThis.expo = globalThis.expo || {};
  globalThis.expo.modules = globalThis.expo.modules || {};
  if (!globalThis.expo.modules.ExpoAsset) {
    globalThis.expo.modules.ExpoAsset = {
      downloadAsync: async (url) => url,
    };
  }
}

try {
  if (NativeModules && !NativeModules.ExpoAsset) {
    NativeModules.ExpoAsset = {
      downloadAsync: (url, hash, type, resolve) => {
        if (typeof resolve === 'function') resolve(url);
        return Promise.resolve(url);
      },
    };
  }
} catch (_) {}
