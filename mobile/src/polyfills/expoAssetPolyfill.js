import { NativeModules } from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';

const fallbackAssetModule = {
  downloadAsync: async (url) => url,
};

// 1. Register on NativeModulesProxy (checked by requireOptionalNativeModule in expo-modules-core)
try {
  if (NativeModulesProxy && !NativeModulesProxy.ExpoAsset) {
    NativeModulesProxy.ExpoAsset = fallbackAssetModule;
  }
} catch (_) {}

// 2. Safely register on globalThis.expo.modules without assigning to read-only globalThis.expo
try {
  if (typeof globalThis !== 'undefined' && globalThis.expo) {
    if (globalThis.expo.modules && !globalThis.expo.modules.ExpoAsset) {
      globalThis.expo.modules.ExpoAsset = fallbackAssetModule;
    }
  }
} catch (_) {}

// 3. Register on NativeModules for legacy React Native bridges
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
