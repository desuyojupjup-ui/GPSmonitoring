import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, LayersControl, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { MOCK_EMPLOYEES, MOCK_SITES, MOCK_LOCATIONS, MOCK_DESTINATIONS } from '../mockData';
import { Search, Navigation, Wifi, WifiOff, MapPin, Crosshair, PlayCircle, BarChart3, ChevronRight, LayoutDashboard, Building2, Truck, ShieldAlert, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const { BaseLayer, Overlay } = LayersControl;

const STATUS_COLORS = { 'On Site':'#10B981','On Duty':'#3B82F6','In Transit':'#F59E0B','Offline':'#9CA3AF' };
const STATUS_BG     = { 'On Site':'#D1FAE5','On Duty':'#DBEAFE','In Transit':'#FEF3C7','Offline':'#F3F4F6' };

const DEST_STATUS_STYLE = {
  'Completed':   { bg:'#D1FAE5', color:'#065F46', icon: CheckCircle },
  'In Progress': { bg:'#DBEAFE', color:'#1E40AF', icon: Clock },
  'Pending':     { bg:'#F3F4F6', color:'#6B7280', icon: MapPin },
};

function createIcon(initials, color, profilePic, isSelected=false, workType='Fixed Site Employee') {
  const content = profilePic
    ? `<img src="${profilePic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
    : `<span style="font-size:13px;font-weight:800;color:white;">${initials}</span>`;
  const sz = isSelected ? 54 : 44;
  const imgSz = isSelected ? 40 : 32;
  const totalH = sz + 16;
  const pulse = color !== '#9CA3AF';
  const badge = workType === 'Mobile Field Employee' ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#F59E0B;border:2px solid white;display:flex;align-items:center;justify-content:center;z-index:3;font-size:8px;">🚚</div>` : '';
  return L.divIcon({
    html: `<div style="position:relative;width:${sz}px;height:${totalH}px;display:flex;flex-direction:column;align-items:center;">
      ${pulse ? `<div style="position:absolute;top:0;left:0;width:${sz}px;height:${sz}px;border-radius:50%;background:${color};opacity:0.3;animation:pinPulse 2s ease-out infinite;"></div>` : ''}
      <div style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;overflow:visible;z-index:2;">
        <div style="width:${imgSz}px;height:${imgSz}px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:white;">${content}</div>
        ${badge}
      </div>
      <div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:14px solid ${color};margin-top:-2px;z-index:1;"></div>
    </div>
    <style>@keyframes pinPulse{0%{transform:scale(1);opacity:.3}70%{transform:scale(2);opacity:0}100%{transform:scale(2);opacity:0}}</style>`,
    className: '', iconSize:[sz,totalH], iconAnchor:[sz/2,totalH], popupAnchor:[0,-totalH],
  });
}

function destIcon(status) {
  const colors = { 'Completed':'#10B981','In Progress':'#3B82F6','Pending':'#9CA3AF' };
  const c = colors[status] || '#9CA3AF';
  return L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${c};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);"></div>`,
    className:'', iconSize:[20,20], iconAnchor:[10,10],
  });
}

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target?.lat && target?.lng) map.flyTo([target.lat,target.lng],17,{duration:1.5}); }, [target?.lat,target?.lng,map]);
  return null;
}

function MapFitBounds({ boundsLocations, focusTrigger }) {
  const map = useMap();
  const [hasFit,setHasFit]=useState(false);
  const [lastTrigger,setLastTrigger]=useState(0);
  useEffect(() => {
    if (boundsLocations.length>0 && (!hasFit||focusTrigger>lastTrigger)) {
      map.fitBounds(L.latLngBounds(boundsLocations.map(l=>[l.lat,l.lng])),{padding:[80,80],maxZoom:16});
      setHasFit(true); setLastTrigger(focusTrigger);
    }
  },[boundsLocations,map,hasFit,focusTrigger,lastTrigger]);
  return null;
}

function LocateControl() {
  const map = useMap();
  return (
    <button onClick={() => map.locate().on('locationfound',e=>map.flyTo(e.latlng,15))} title="My Location"
      style={{position:'absolute',bottom:30,right:20,zIndex:1000,background:'white',border:'none',borderRadius:'50%',width:44,height:44,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(0,0,0,0.15)',cursor:'pointer',color:'#1E5ADB'}}>
      <Crosshair size={20} />
    </button>
  );
}

export default function LiveTracking() {
  const [employees] = useState(MOCK_EMPLOYEES);
  const [locations] = useState(MOCK_LOCATIONS);
  const [sites]     = useState(MOCK_SITES);
  const [destinations] = useState(MOCK_DESTINATIONS);
  const [filter, setFilter]         = useState('all');
  const [wtFilter, setWtFilter]     = useState('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [focusTrigger, setFocusTrigger] = useState(0);

  const filtered = employees.filter(emp => {
    const matchS = emp.name?.toLowerCase().includes(search.toLowerCase());
    const status = emp.status || 'Offline';
    const matchF = filter==='all' || status.toLowerCase().replace(' ','')===filter.toLowerCase().replace(' ','');
    const matchW = wtFilter==='all' || emp.workType===wtFilter;
    return matchS && matchF && matchW;
  });

  const mappable = filtered.filter(e => locations[e.id]?.lat);
  const selectedWithLoc = selected ? {...selected,...(locations[selected.id]||{})} : null;

  // For selected mobile employee, build destination list
  const selectedDests = useMemo(() => {
    if (!selected || selected.workType !== 'Mobile Field Employee') return [];
    return (selected.assignedDestinations || []).map(id => destinations[id]).filter(Boolean);
  }, [selected, destinations]);

  // Route polyline for mobile employees
  const selectedRoute = useMemo(() => {
    if (!selectedDests.length) return [];
    return selectedDests.filter(d=>d.lat&&d.lng).map(d=>[d.lat,d.lng]);
  }, [selectedDests]);

  // Site for fixed employee
  const selectedSite = useMemo(() => {
    if (!selected || selected.workType !== 'Fixed Site Employee') return null;
    return sites.find(s => s.id === selected.assignedSite);
  }, [selected, sites]);

  const fixedCount  = employees.filter(e=>e.workType==='Fixed Site Employee').length;
  const mobileCount = employees.filter(e=>e.workType==='Mobile Field Employee').length;
  const outsideCount= employees.filter(e=>e.geofenceStatus==='Outside Assigned Site').length;

  return (
    <div style={{position:'relative',flex:1,display:'flex',height:'calc(100vh - 65px)',overflow:'hidden'}}>
      {/* Map */}
      <div style={{flex:1,position:'relative'}}>
        <MapContainer center={[14.608,120.990]} zoom={13} style={{height:'100%',width:'100%'}} zoomControl={false}>
          <LayersControl position="topright">
            <BaseLayer checked name="OpenStreetMap">
              <TileLayer attribution='&copy; CartoDB' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            </BaseLayer>
            <BaseLayer name="Satellite View">
              <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </BaseLayer>
            <Overlay checked name="Geofences">
              {sites.map(site => {
                const r = typeof site.radius==='string' ? parseInt(site.radius.replace('m','')) : (site.radius||300);
                if (!site.lat||!site.lng) return null;
                const isViolated = employees.some(e=>e.assignedSite===site.id&&e.geofenceStatus==='Outside Assigned Site');
                return (
                  <Circle key={site.id} center={[site.lat,site.lng]} radius={r}
                    pathOptions={{color:isViolated?'#EF4444':'#4F46E5',fillColor:isViolated?'#EF4444':'#4F46E5',fillOpacity:0.08,dashArray:'6 4',weight:2}}>
                    <Tooltip direction="top" opacity={0.9} permanent className="glass-tooltip">
                      <div style={{fontWeight:700,fontSize:12}}>{site.name}</div>
                      {isViolated && <div style={{color:'#EF4444',fontSize:10}}>⚠ Violation</div>}
                    </Tooltip>
                  </Circle>
                );
              })}
            </Overlay>
            <Overlay checked name="Mobile Routes">
              {selected?.workType==='Mobile Field Employee' && selectedRoute.length>1 && (
                <Polyline positions={selectedRoute} pathOptions={{color:'#F59E0B',weight:4,dashArray:'8 8',lineCap:'round'}} />
              )}
            </Overlay>
            <Overlay checked name="Destination Pins">
              {selected?.workType==='Mobile Field Employee' && selectedDests.map(dest => (
                dest.lat&&dest.lng ? (
                  <Marker key={dest.id} position={[dest.lat,dest.lng]} icon={destIcon(dest.status)}>
                    <Tooltip direction="top" opacity={1}>
                      <div style={{fontWeight:700,fontSize:12}}>{dest.name}</div>
                      <div style={{fontSize:11,color:DEST_STATUS_STYLE[dest.status]?.color}}>{dest.status}</div>
                    </Tooltip>
                  </Marker>
                ) : null
              ))}
            </Overlay>
          </LayersControl>

          {selectedWithLoc && <MapFlyTo target={selectedWithLoc} />}
          {!selectedWithLoc && <MapFitBounds boundsLocations={mappable.map(e=>locations[e.id])} focusTrigger={focusTrigger} />}
          <LocateControl />

          {mappable.map(emp => {
            const loc = locations[emp.id];
            const status = emp.status||'Offline';
            const initials = emp.name?.split(' ').map(n=>n[0]).join('').toUpperCase()||'?';
            return (
              <Marker key={emp.id} position={[loc.lat,loc.lng]}
                icon={createIcon(initials,STATUS_COLORS[status]||'#9CA3AF',emp.profilePic,selected?.id===emp.id,emp.workType)}
                eventHandlers={{click:()=>setSelected(emp)}} zIndexOffset={selected?.id===emp.id?1000:0}>
                {selected?.id!==emp.id && (
                  <Tooltip direction="bottom" offset={[0,10]} opacity={1}>
                    <div style={{fontWeight:600,fontSize:12}}>{emp.name}</div>
                    <div style={{fontSize:10,color:'#6B7280'}}>{emp.workType==='Mobile Field Employee'?'🚚 Mobile':'🏢 Fixed'}</div>
                  </Tooltip>
                )}
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Side Panel */}
      <div className="glass-panel" style={{position:'absolute',top:20,left:20,bottom:20,width:340,zIndex:1000,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header */}
        <div style={{padding:'18px 20px',borderBottom:'1px solid rgba(255,255,255,0.2)'}}>
          <h2 style={{fontSize:17,fontWeight:700,color:'#111827',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <LayoutDashboard size={18} color="#1E5ADB" /> Fleet Overview
          </h2>
          <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.7)',borderRadius:10,padding:'8px 12px',border:'1px solid rgba(255,255,255,0.4)'}}>
            <Search size={15} color="#6B7280" />
            <input placeholder="Search employee or site..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{border:'none',background:'transparent',outline:'none',fontSize:13,color:'#374151',width:'100%',fontWeight:500}} />
          </div>
          {/* Work Type Mini Stats */}
          <div style={{display:'flex',gap:8,marginTop:10}}>
            {[
              {label:`${fixedCount} Fixed`,  icon:Building2, color:'#5B21B6', bg:'#EDE9FE', val:'fixed'},
              {label:`${mobileCount} Mobile`,icon:Truck,     color:'#92400E', bg:'#FEF3C7', val:'mobile'},
              ...(outsideCount>0?[{label:`${outsideCount} Outside`,icon:ShieldAlert,color:'#991B1B',bg:'#FEE2E2',val:'outside'}]:[]),
            ].map(({label,icon:Icon,color,bg,val})=>(
              <button key={val} onClick={()=>setWtFilter(wtFilter===val?'all':val)}
                style={{flex:1,display:'flex',alignItems:'center',gap:5,padding:'5px 8px',borderRadius:6,border:`1.5px solid ${wtFilter===val?color:'transparent'}`,background:bg,cursor:'pointer',fontSize:10,fontWeight:700,color}}>
                <Icon size={10}/>{label}
              </button>
            ))}
          </div>
        </div>

        {/* Status filter pills */}
        <div className="hide-scrollbar" style={{display:'flex',gap:6,padding:'12px 20px',overflowX:'auto',borderBottom:'1px solid rgba(255,255,255,0.2)'}}>
          {['all','On Site','On Duty','In Transit','Offline'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{
              padding:'5px 10px',borderRadius:20,border:'1px solid rgba(255,255,255,0.5)',cursor:'pointer',fontSize:10,fontWeight:600,whiteSpace:'nowrap',
              background:filter===f?'#1E5ADB':'rgba(255,255,255,0.6)',color:filter===f?'white':'#4B5563',
              boxShadow:filter===f?'0 4px 10px rgba(30,90,219,0.3)':'none'
            }}>{f==='all'?`All (${employees.length})`:f}</button>
          ))}
        </div>

        {/* Detail / List */}
        {selected ? (
          <div style={{flex:1,padding:20,overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
            <button onClick={()=>setSelected(null)} style={{background:'transparent',border:'none',color:'#1E5ADB',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:4,cursor:'pointer',padding:0}}>
              <ChevronRight size={16} style={{transform:'rotate(180deg)'}}/> Back
            </button>
            {/* Avatar */}
            <div style={{textAlign:'center'}}>
              <div style={{width:72,height:72,borderRadius:'50%',margin:'0 auto 10px',background:STATUS_COLORS[selected.status]||'#9CA3AF',padding:3,boxShadow:'0 6px 16px rgba(0,0,0,0.1)'}}>
                <div style={{width:'100%',height:'100%',borderRadius:'50%',background:'white',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:700,color:'#9CA3AF'}}>
                  {selected.name?.split(' ').map(n=>n[0]).join('')}
                </div>
              </div>
              <div style={{fontSize:16,fontWeight:700,color:'#111827'}}>{selected.name}</div>
              <div style={{fontSize:12,color:'#6B7280',marginTop:3}}>{selected.email}</div>
              <div style={{display:'inline-flex',alignItems:'center',gap:5,background:STATUS_BG[selected.status]||'#F3F4F6',color:STATUS_COLORS[selected.status]||'#9CA3AF',padding:'5px 12px',borderRadius:20,fontWeight:600,fontSize:11,marginTop:10}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:STATUS_COLORS[selected.status]||'#9CA3AF'}}/>
                {selected.status||'Offline'}
              </div>
              {/* Work type badge */}
              <div style={{marginTop:8,display:'inline-flex',alignItems:'center',gap:5,
                background:selected.workType==='Mobile Field Employee'?'#FEF3C7':'#EDE9FE',
                color:selected.workType==='Mobile Field Employee'?'#92400E':'#5B21B6',
                padding:'4px 10px',borderRadius:20,fontWeight:600,fontSize:10}}>
                {selected.workType==='Mobile Field Employee'?<Truck size={10}/>:<Building2 size={10}/>}
                {selected.workType}
              </div>
            </div>

            {/* Fixed Site Panel */}
            {selected.workType==='Fixed Site Employee' && (
              <div style={{background:'rgba(255,255,255,0.7)',borderRadius:12,padding:14,border:'1px solid rgba(255,255,255,0.5)'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#111827',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                  <Building2 size={14}/> Fixed Site Details
                </div>
                {selectedSite && (
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,color:'#6B7280'}}>Assigned Site</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#111827'}}>{selectedSite.name}</div>
                  </div>
                )}
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:'#6B7280'}}>Geofence Radius</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#1E5ADB'}}>{selected.geofenceRadius||100}m</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#6B7280'}}>Geofence Status</div>
                  {selected.geofenceStatus ? (
                    <div style={{fontSize:12,fontWeight:700,color:selected.geofenceStatus==='Outside Assigned Site'?'#DC2626':'#059669',marginTop:2}}>
                      {selected.geofenceStatus==='Outside Assigned Site'?'⚠ ':'✓ '}{selected.geofenceStatus}
                    </div>
                  ) : <div style={{fontSize:12,color:'#9CA3AF'}}>—</div>}
                </div>
              </div>
            )}

            {/* Mobile Field Panel */}
            {selected.workType==='Mobile Field Employee' && (
              <div style={{background:'rgba(255,255,255,0.7)',borderRadius:12,padding:14,border:'1px solid rgba(255,255,255,0.5)'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#111827',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                  <Truck size={14}/> Route & Destinations
                </div>
                {selectedDests.length===0 && <div style={{fontSize:12,color:'#9CA3AF'}}>No destinations assigned.</div>}
                {selectedDests.map((dest,i)=>{
                  const ds = DEST_STATUS_STYLE[dest.status]||DEST_STATUS_STYLE['Pending'];
                  const DSIcon = ds.icon;
                  return (
                    <div key={dest.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,paddingBottom:10,borderBottom:i<selectedDests.length-1?'1px solid #F3F4F6':'none'}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:ds.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <DSIcon size={13} color={ds.color}/>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dest.name}</div>
                        <div style={{fontSize:10,color:'#6B7280'}}>{dest.type}</div>
                      </div>
                      <div style={{fontSize:10,fontWeight:700,color:ds.color,background:ds.bg,padding:'2px 6px',borderRadius:10,whiteSpace:'nowrap'}}>{dest.status}</div>
                    </div>
                  );
                })}
                {selectedDests.length>0 && (
                  <div style={{marginTop:4,fontSize:11,color:'#6B7280',textAlign:'right'}}>
                    {selectedDests.filter(d=>d.status==='Completed').length}/{selectedDests.length} completed
                  </div>
                )}
              </div>
            )}

            <button style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,background:'#10B981',color:'white',border:'none',padding:'11px',borderRadius:10,fontWeight:600,fontSize:13,cursor:'pointer',boxShadow:'0 4px 12px rgba(16,185,129,0.3)'}}>
              <PlayCircle size={16}/> Replay History
            </button>
          </div>
        ) : (
          <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
            {filtered.length===0 && <div style={{padding:30,textAlign:'center',color:'#6B7280',fontSize:13}}>No results found.</div>}
            {filtered.map(emp=>{
              const loc = locations[emp.id];
              const status = emp.status||'Offline';
              const initials = emp.name?.split(' ').map(n=>n[0]).join('').toUpperCase()||'?';
              return (
                <div key={emp.id} onClick={()=>setSelected(emp)} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 20px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.2)',transition:'all 0.15s'}}
                  onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.6)'}
                  onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:STATUS_COLORS[status]||'#9CA3AF',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:13,flexShrink:0,overflow:'hidden',border:'2px solid white'}}>
                    {emp.profilePic?<img src={emp.profilePic} alt={emp.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{emp.name}</div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:STATUS_COLORS[status]||'#9CA3AF'}}/>
                        <span style={{fontSize:10,color:STATUS_COLORS[status]||'#9CA3AF',fontWeight:600}}>{status}</span>
                      </div>
                      <span style={{fontSize:9,fontWeight:600,padding:'2px 6px',borderRadius:10,
                        background:emp.workType==='Mobile Field Employee'?'#FEF3C7':'#EDE9FE',
                        color:emp.workType==='Mobile Field Employee'?'#92400E':'#5B21B6'}}>
                        {emp.workType==='Mobile Field Employee'?'Mobile':'Fixed'}
                      </span>
                      {emp.geofenceStatus==='Outside Assigned Site' && <ShieldAlert size={11} color="#EF4444"/>}
                    </div>
                  </div>
                  {loc?<Wifi size={13} color="#10B981"/>:<WifiOff size={13} color="#D1D5DB"/>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!selected && (
        <div style={{position:'absolute',top:20,right:20,zIndex:1000,display:'flex',gap:10}}>
          <div className="glass-panel" style={{padding:'10px 18px',display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'#10B981',animation:'pulse 1.5s infinite'}}/>
            <div>
              <div style={{fontSize:10,color:'#6B7280',fontWeight:600}}>LIVE TRACKING</div>
              <div style={{fontSize:13,fontWeight:700,color:'#111827'}}>{mappable.length} Online</div>
            </div>
          </div>
          <button onClick={()=>setFocusTrigger(p=>p+1)} className="glass-panel"
            style={{padding:'0 16px',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,color:'#1E5ADB'}}>
            <Crosshair size={15}/> Fit Bounds
          </button>
        </div>
      )}

      <style>{`
        .leaflet-top.leaflet-right { top: 80px; right: 20px; }
        .glass-panel { background:rgba(255,255,255,0.75);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.4);border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1); }
        .leaflet-tooltip.glass-tooltip { background:rgba(255,255,255,0.9);border:none;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);color:#111827; }
        .hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>
    </div>
  );
}