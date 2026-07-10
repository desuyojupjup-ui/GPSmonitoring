// GeoStride DEMO - Mobile Mock Firebase
// No actual Firebase connections. All data is local.

export const auth = {
  currentUser: null,
  signInWithEmailAndPassword: async () => ({ user: { email: 'user@demo.com', uid: 'demo-uid' } }),
  signOut: async () => {},
  onAuthStateChanged: () => () => {},
};

export const db = {};

export const initializeAuth = () => ({});
export const getReactNativePersistence = () => ({});

export const getFirestore = () => ({});

// Safe no-op stubs - these replace real Firestore functions
export const collection = (_db, _path) => ({ path: _path, type: 'collection' });
export const query = (_ref, ..._args) => _ref;
export const where = (_field, _op, _val) => ({ field: _field, op: _op, val: _val });
export const getDocs = async (_q) => ({ empty: true, docs: [], forEach: () => {} });
export const onSnapshot = (_q, _success, _error) => () => {};
export const addDoc = async (_col, _data) => ({ id: 'mock-' + Date.now() });
export const updateDoc = async (_doc, _data) => {};
export const deleteDoc = async (_doc) => {};
export const doc = (_db, _path) => ({ id: _path.split('/').pop(), ref: { id: _path } });
export const serverTimestamp = () => new Date().toISOString();