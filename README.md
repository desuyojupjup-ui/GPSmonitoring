# GPS-Based Employee Site Monitoring System

A comprehensive solution for tracking field employees using GPS and geofencing technology, built with Flutter, React (Vite), OpenStreetMap, and Firebase.

## 🚀 Project Architecture

The system is composed of three main parts:
1. **Mobile App (`/mobile`)**: Flutter application for field employees to track their live locations, authenticate, and manage site tasks.
2. **Admin Dashboard (`/admin-dashboard`)**: Modern, React.js web portal using Recharts and React-Leaflet to monitor all employees in real time and manage assignments.
3. **Backend (`/firebase`)**: Cloud Firestore rules, authentication, and database structure.

## 📁 Generated Structure
```
c:/Users/63977/Documents/GPSmonitoring
├── admin-dashboard/          # Web Admin Dashboard (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx # High-level stats & charts
│   │   │   ├── MapTracking.jsx # Live tracking with OpenStreetMap
│   │   │   └── Sidebar.jsx   # Modern navigation sidebar
│   │   ├── App.jsx           # App Routing
│   │   ├── firebase.js       # Firebase initialization
│   │   └── index.css         # Berry MUI-inspired glassmorphism UI
│   └── package.json
├── mobile/                   # Flutter Mobile App
│   ├── lib/
│   │   ├── screens/
│   │   │   ├── home_screen.dart # Maps and GPS Tracking logic
│   │   │   └── login_screen.dart # Firebase Auth UI
│   │   └── main.dart         # Flutter entry point
│   └── pubspec.yaml          # Dependencies
└── firebase/                 # Firebase configuration
    └── firestore.rules       # Security and RBAC rules
```

## ✨ Key Features Implemented

### 📱 Mobile Application (Expo / React Native)
- **OpenStreetMap Integration:** Uses `react-native-maps` with `UrlTile` to render standard OSM map tiles instead of Google/Apple maps.
- **Live Location Tracking:** Implements `expo-location` to precisely track coordinates and stream them to Firestore.
- **Authentication:** Secure Firebase Email/Password login.
- **Clean UI:** Styled natively using React Native StyleSheet with professional colors.

### 💻 Admin Dashboard (React.js)
- **Real-Time Tracking Map:** Utilizes `react-leaflet` to display multiple employee markers, movement speed, and defined geofences on OpenStreetMap.
- **Glassmorphism UI:** Applied modern CSS with translucent cards, smooth gradients, and drop shadows, heavily inspired by premium dashboard themes like Berry MUI.
- **Data Analytics:** Implemented `recharts` for tracking daily active employees over a weekly trend.
- **Responsive Layout:** Flexbox and CSS Grid based modern dashboard with a fixed sidebar navigation using `lucide-react` icons.

### ☁️ Backend & Database
- **Role-Based Access Control:** Configured `firestore.rules` to strictly allow employee location pushes while keeping admin read access completely secure.
- **Real-Time Subscriptions:** Firestore `onSnapshot` used in the React dashboard allows immediate UI updates the moment an employee's location changes in the mobile app.

## 🛠️ How to Run

### 1. Web Admin Dashboard
```bash
cd admin-dashboard
npm install
npm run dev
```

### 2. Mobile App (Expo / React Native)
To launch the app directly on your iPhone using the Expo Go app:
```bash
cd mobile
npm install
npm install firebase @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
npx expo install react-native-maps expo-location
npx expo start
```
Then, simply open the **Camera** app on your iPhone and scan the QR code that appears in the terminal!

> **Note:** Ensure you replace the dummy Firebase credentials in `admin-dashboard/src/firebase.js` and `mobile/src/firebase.js` before production use.
