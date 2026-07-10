import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { MOCK_EMPLOYEES, MOCK_SITES, MOCK_LOCATIONS } from '../mockData';

const employeeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const siteIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const MapTracking = () => {
  const [employees] = useState(MOCK_EMPLOYEES);
  const [sites] = useState(MOCK_SITES);

  const activeEmployees = employees.filter(e => MOCK_LOCATIONS[e.id]);

  const center = [14.6091, 121.0223];

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Live Tracking Map</h1>
        <p style={{ color: 'var(--text-muted)' }}>Monitor employee movements and site geofences in real-time.</p>
      </header>

      <div className="map-container">
        <MapContainer center={center} zoom={12} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {sites.map(site => (
            <React.Fragment key={site.id}>
              <Circle
                center={[site.lat, site.lng]}
                radius={site.radius || 300}
                pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.2 }}
              />
              <Marker position={[site.lat, site.lng]} icon={siteIcon}>
                <Popup>
                  <strong>{site.name}</strong><br/>
                  Radius: {site.radius}m
                </Popup>
              </Marker>
            </React.Fragment>
          ))}

          {activeEmployees.map(emp => {
            const loc = MOCK_LOCATIONS[emp.id];
            return (
              <Marker key={emp.id} position={[loc.lat, loc.lng]} icon={employeeIcon}>
                <Popup>
                  <strong>{emp.name}</strong><br/>
                  Status: {emp.status}
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default MapTracking;