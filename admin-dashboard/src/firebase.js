// ============================================================
// GeoStride DEMO - Firebase Mock
// ============================================================
// All Firebase functionality has been replaced with local mock data.
// No actual Firebase connections, authentication, or database calls.
// ============================================================

// Mock auth object that always has a signed-in user  
export const auth = {
  currentUser: { email: 'admin@geostride.com', uid: 'demo-admin-uid' },
};

// Mock Firestore (no-op implementation to prevent crashes)
export const db = {};

// Mock secondary auth
export const secondaryAuth = {};
export const secondaryApp = {};