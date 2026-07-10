// ============================================================
// GeoStride Demo - Mock Data & Simulation Engine
// ============================================================
// All data is generated locally. No Firebase or backend calls.
// ============================================================

// ─── EMPLOYEES ───────────────────────────────────────────────
const NOW = new Date();

export const MOCK_EMPLOYEES = [
  { id: 'emp1',  name: 'John Cruz',        email: 'john.cruz@geostride.com',    idNum: 'EMP-1001', org: 'Field Operations',  type: 'Field Inspector',    status: 'On Site',    joined: 'Jan 15, 2026\n10:30 AM', profilePic: null, phone: '09171234567', department: 'Field Operations' },
  { id: 'emp2',  name: 'Maria Santos',     email: 'maria.santos@geostride.com',  idNum: 'EMP-1002', org: 'Security',          type: 'Security Guard',     status: 'On Duty',    joined: 'Feb 3, 2026\n9:00 AM',  profilePic: null, phone: '09179876543', department: 'Security' },
  { id: 'emp3',  name: 'David Reyes',      email: 'david.reyes@geostride.com',   idNum: 'EMP-1003', org: 'Maintenance',       type: 'Technician',         status: 'In Transit', joined: 'Mar 12, 2026\n11:15 AM', profilePic: null, phone: '09177654321', department: 'Maintenance' },
  { id: 'emp4',  name: 'Anna Lim',         email: 'anna.lim@geostride.com',      idNum: 'EMP-1004', org: 'Field Operations',  type: 'Site Supervisor',    status: 'On Site',    joined: 'Jan 20, 2026\n8:45 AM', profilePic: null, phone: '09175432109', department: 'Field Operations' },
  { id: 'emp5',  name: 'James Gonzales',   email: 'james.g@geostride.com',       idNum: 'EMP-1005', org: 'Logistics',         type: 'Driver',             status: 'In Transit', joined: 'Apr 5, 2026\n1:30 PM',  profilePic: null, phone: '09173216547', department: 'Logistics' },
  { id: 'emp6',  name: 'Sofia Martinez',   email: 'sofia.m@geostride.com',       idNum: 'EMP-1006', org: 'IT',                type: 'Support Engineer',   status: 'On Duty',    joined: 'Feb 28, 2026\n10:00 AM', profilePic: null, phone: '09178901234', department: 'IT' },
  { id: 'emp7',  name: 'Carlos Tan',       email: 'carlos.t@geostride.com',      idNum: 'EMP-1007', org: 'Field Operations',  type: 'Field Inspector',    status: 'Offline',    joined: 'May 10, 2026\n9:30 AM', profilePic: null, phone: '09176543210', department: 'Field Operations' },
  { id: 'emp8',  name: 'Isabella Torres',  email: 'isabella.t@geostride.com',    idNum: 'EMP-1008', org: 'Security',          type: 'Security Guard',     status: 'On Site',    joined: 'Mar 1, 2026\n7:00 AM',  profilePic: null, phone: '09172345678', department: 'Security' },
  { id: 'emp9',  name: 'Michael Rivera',   email: 'michael.r@geostride.com',     idNum: 'EMP-1009', org: 'Maintenance',       type: 'Electrician',        status: 'On Duty',    joined: 'Jun 18, 2026\n2:00 PM', profilePic: null, phone: '09178765432', department: 'Maintenance' },
  { id: 'emp10', name: 'Patricia Cruz',    email: 'patricia.c@geostride.com',    idNum: 'EMP-1010', org: 'Administration',    type: 'Admin Staff',        status: 'Offline',    joined: 'Apr 22, 2026\n8:00 AM', profilePic: null, phone: '09174567890', department: 'Administration' },
  { id: 'emp11', name: 'Roberto Diaz',     email: 'roberto.d@geostride.com',     idNum: 'EMP-1011', org: 'Logistics',         type: 'Supply Coordinator', status: 'In Transit', joined: 'May 30, 2026\n10:15 AM', profilePic: null, phone: '09179871234', department: 'Logistics' },
  { id: 'emp12', name: 'Angela Ramos',    email: 'angela.r@geostride.com',      idNum: 'EMP-1012', org: 'Field Operations',  type: 'Field Inspector',    status: 'On Site',    joined: 'Jul 8, 2026\n9:00 AM',  profilePic: null, phone: '09175678901', department: 'Field Operations' },
  { id: 'emp13', name: 'Admin User',       email: 'admin@geostride.com',          idNum: 'ADM-001',  org: 'Administration',    type: 'Admin',              status: 'On Duty',    joined: 'Jan 1, 2026\n12:00 AM', profilePic: null, phone: '09170000001', department: 'Administration' },
];

// ─── LOCATIONS (Manila area coordinates) ────────────────────
export const MOCK_LOCATIONS = {
  emp1:  { lat: 14.610, lng: 120.985 },  // John Cruz - On Site
  emp2:  { lat: 14.605, lng: 120.992 },  // Maria Santos - On Duty
  emp3:  { lat: 14.620, lng: 120.975 },  // David Reyes - In Transit
  emp4:  { lat: 14.615, lng: 120.988 },  // Anna Lim - On Site
  emp5:  { lat: 14.595, lng: 120.960 },  // James Gonzales - In Transit
  emp6:  { lat: 14.608, lng: 120.990 },  // Sofia Martinez - On Duty
  emp8:  { lat: 14.612, lng: 120.982 },  // Isabella Torres - On Site
  emp9:  { lat: 14.600, lng: 120.995 },  // Michael Rivera - On Duty
  emp11: { lat: 14.590, lng: 120.970 },  // Roberto Diaz - In Transit
  emp12: { lat: 14.618, lng: 120.980 },  // Angela Ramos - On Site
  emp13: { lat: 14.607, lng: 120.988 },  // Admin User - On Duty
};

// Timestamps - generate relative timestamps
function timeAgo(minutesAgo) {
  const d = new Date(NOW.getTime() - minutesAgo * 60000);
  return d;
}

export function mockTimestamp(date) {
  return { toDate: () => date, toMillis: () => date.getTime() };
}

// ─── SITES ──────────────────────────────────────────────────
export const MOCK_SITES = [
  { id: 'site1',  name: 'Greenfield Mall',         company: 'Ayala Malls',       address: 'Greenfield District, Mandaluyong', lat: 14.580, lng: 121.045,  radius: 300, status: 'Active',   created: 'Jan 10, 2026\n9:00 AM', createdAt: mockTimestamp(new Date('2026-01-10')) },
  { id: 'site2',  name: 'Central Station',          company: 'MRT Corp',          address: 'EDSA, Quezon City',                lat: 14.620, lng: 121.025,  radius: 200, status: 'Active',   created: 'Feb 15, 2026\n10:30 AM', createdAt: mockTimestamp(new Date('2026-02-15')) },
  { id: 'site3',  name: 'Riverside Business Park',  company: 'Megaworld',         address: 'Pasig River, Makati',               lat: 14.555, lng: 121.020,  radius: 400, status: 'Active',   created: 'Mar 5, 2026\n11:00 AM', createdAt: mockTimestamp(new Date('2026-03-05')) },
  { id: 'site4',  name: 'North Edsa Terminal',      company: 'LTFRB',             address: 'North Avenue, Quezon City',         lat: 14.655, lng: 121.030,  radius: 250, status: 'Inactive', created: 'Apr 20, 2026\n1:00 PM', createdAt: mockTimestamp(new Date('2026-04-20')) },
  { id: 'site5',  name: 'Makati City Hall Annex',   company: 'Makati LGU',        address: 'J.P. Rizal, Makati',                lat: 14.560, lng: 121.015,  radius: 180, status: 'Active',   created: 'May 8, 2026\n8:30 AM', createdAt: mockTimestamp(new Date('2026-05-08')) },
  { id: 'site6',  name: 'BGC Construction Site',    company: 'DMCI Homes',        address: 'Bonifacio Global City, Taguig',     lat: 14.550, lng: 121.055,  radius: 500, status: 'Active',   created: 'Jun 12, 2026\n2:00 PM', createdAt: mockTimestamp(new Date('2026-06-12')) },
];

// ─── ATTENDANCE ─────────────────────────────────────────────
function generateAttendance() {
  const statuses = ['Completed', 'On Site', 'Checked In', 'Late', 'Absent'];
  const records = [];
  let id = 1;
  
  MOCK_EMPLOYEES.forEach(emp => {
    const s = statuses[Math.floor(Math.random() * 4)]; // bias away from Absent
    const checkInHour = 7 + Math.floor(Math.random() * 3);
    const checkInMin = Math.floor(Math.random() * 60);
    const checkOutHour = checkInHour + 8 + Math.floor(Math.random() * 2);
    const checkOutMin = Math.floor(Math.random() * 60);
    const duration = `${8 + Math.floor(Math.random() * 3)}h ${Math.floor(Math.random() * 60)}m`;
    const verification = Math.random() > 0.3 ? 'Verified' : 'System';
    
    records.push({
      id: `att${id++}`,
      employee_name: emp.name,
      emp: emp.name,
      employee_id: emp.id,
      site_name: MOCK_SITES[id % MOCK_SITES.length].name,
      site: MOCK_SITES[id % MOCK_SITES.length].name,
      check_in: `${checkInHour.toString().padStart(2,'0')}:${checkInMin.toString().padStart(2,'0')} AM`,
      in: `${checkInHour.toString().padStart(2,'0')}:${checkInMin.toString().padStart(2,'0')} AM`,
      check_out: `${checkOutHour.toString().padStart(2,'0')}:${checkOutMin.toString().padStart(2,'0')} ${checkOutHour >= 12 ? 'PM' : 'AM'}`,
      out: `${checkOutHour.toString().padStart(2,'0')}:${checkOutMin.toString().padStart(2,'0')} ${checkOutHour >= 12 ? 'PM' : 'AM'}`,
      duration: duration,
      dur: duration,
      status: s,
      verification: verification,
      verif: verification,
      date: mockTimestamp(new Date()),
      timeIn: mockTimestamp(new Date(NOW.getTime() - Math.random() * 36000000)),
      timeOut: mockTimestamp(new Date(NOW.getTime() - Math.random() * 10000000)),
    });
  });
  return records;
}

export const MOCK_ATTENDANCE = generateAttendance();

// ─── ASSIGNMENTS ────────────────────────────────────────────
export const MOCK_ASSIGNMENTS = [
  { id: 'asg1',  empName: 'John Cruz',      empId: 'EMP-1001', site: 'Greenfield Mall',         assignDate: '2026-07-09', shiftStart: '07:00', shiftEnd: '16:00', shift: '07:00 - 16:00', priority: 'High',   status: 'Active',    created: 'Jul 8, 2026\n10:00 AM', createdAt: mockTimestamp(new Date('2026-07-08')) },
  { id: 'asg2',  empName: 'Maria Santos',   empId: 'EMP-1002', site: 'Central Station',          assignDate: '2026-07-09', shiftStart: '08:00', shiftEnd: '17:00', shift: '08:00 - 17:00', priority: 'High',   status: 'Active',    created: 'Jul 8, 2026\n9:30 AM',  createdAt: mockTimestamp(new Date('2026-07-08')) },
  { id: 'asg3',  empName: 'David Reyes',    empId: 'EMP-1003', site: 'Riverside Business Park',  assignDate: '2026-07-09', shiftStart: '09:00', shiftEnd: '18:00', shift: '09:00 - 18:00', priority: 'Medium', status: 'Active',    created: 'Jul 7, 2026\n2:00 PM',  createdAt: mockTimestamp(new Date('2026-07-07')) },
  { id: 'asg4',  empName: 'Anna Lim',       empId: 'EMP-1004', site: 'BGC Construction Site',    assignDate: '2026-07-09', shiftStart: '06:00', shiftEnd: '15:00', shift: '06:00 - 15:00', priority: 'High',   status: 'Active',    created: 'Jul 8, 2026\n8:00 AM',  createdAt: mockTimestamp(new Date('2026-07-08')) },
  { id: 'asg5',  empName: 'James Gonzales', empId: 'EMP-1005', site: 'North Edsa Terminal',      assignDate: '2026-07-10', shiftStart: '10:00', shiftEnd: '19:00', shift: '10:00 - 19:00', priority: 'Low',    status: 'Upcoming',  created: 'Jul 6, 2026\n11:00 AM', createdAt: mockTimestamp(new Date('2026-07-06')) },
  { id: 'asg6',  empName: 'Sofia Martinez', empId: 'EMP-1006', site: 'Makati City Hall Annex',   assignDate: '2026-07-09', shiftStart: '08:00', shiftEnd: '17:00', shift: '08:00 - 17:00', priority: 'Medium', status: 'Active',    created: 'Jul 7, 2026\n3:30 PM',  createdAt: mockTimestamp(new Date('2026-07-07')) },
  { id: 'asg7',  empName: 'Carlos Tan',     empId: 'EMP-1007', site: 'Greenfield Mall',          assignDate: '2026-07-11', shiftStart: '07:00', shiftEnd: '16:00', shift: '07:00 - 16:00', priority: 'Medium', status: 'Upcoming',  created: 'Jul 9, 2026\n6:00 AM',  createdAt: mockTimestamp(new Date('2026-07-09')) },
  { id: 'asg8',  empName: 'Isabella Torres',empId: 'EMP-1008', site: 'Riverside Business Park',  assignDate: '2026-07-09', shiftStart: '06:00', shiftEnd: '15:00', shift: '06:00 - 15:00', priority: 'High',   status: 'Completed', created: 'Jul 5, 2026\n9:00 AM',  createdAt: mockTimestamp(new Date('2026-07-05')) },
  { id: 'asg9',  empName: 'Michael Rivera', empId: 'EMP-1009', site: 'Central Station',          assignDate: '2026-07-09', shiftStart: '09:00', shiftEnd: '18:00', shift: '09:00 - 18:00', priority: 'Low',    status: 'Active',    created: 'Jul 8, 2026\n10:30 AM', createdAt: mockTimestamp(new Date('2026-07-08')) },
  { id: 'asg10', empName: 'Roberto Diaz',   empId: 'EMP-1011', site: 'BGC Construction Site',    assignDate: '2026-07-10', shiftStart: '07:00', shiftEnd: '16:00', shift: '07:00 - 16:00', priority: 'Medium', status: 'Upcoming',  created: 'Jul 7, 2026\n1:00 PM',  createdAt: mockTimestamp(new Date('2026-07-07')) },
];

// ─── NOTIFICATIONS ──────────────────────────────────────────
export const MOCK_NOTIFICATIONS = [
  { id: 1, sender: 'System Admin', sub: 'Admin',    title: 'System Update Complete',      message: 'GeoStride v2.4.0 deployed successfully with new AI features.',     date: 'May 23, 2026', time: '7:00 PM', status: 'Unread', type: 'System' },
  { id: 2, sender: 'Geofence Alert', sub: 'Auto',    title: 'Employee Out of Bounds',     message: 'David Reyes has exited the Riverside Bldg geofence zone.',          date: 'May 22, 2026', time: '3:15 PM', status: 'Read',   type: 'Alert' },
  { id: 3, sender: 'Manager John',   sub: 'Manager', title: 'New Schedule Posted',         message: 'The field schedule for next week is now available for review.',     date: 'May 20, 2026', time: '9:00 AM', status: 'Read',   type: 'Message' },
  { id: 4, sender: 'System Admin', sub: 'Admin',    title: 'Backup Completed',            message: 'Weekly data backup completed. All records are safe.',               date: 'May 19, 2026', time: '2:00 AM', status: 'Read',   type: 'System' },
  { id: 5, sender: 'Attendance Alert', sub: 'Auto',  title: 'Late Check-in Detected',     message: 'Roberto Diaz checked in 45 minutes late this morning.',              date: 'May 18, 2026', time: '8:45 AM', status: 'Unread', type: 'Alert' },
  { id: 6, sender: 'HR Department', sub: 'HR',      title: 'New Employee Onboarded',      message: 'Angela Ramos has been onboarded and assigned to Field Operations.',  date: 'May 17, 2026', time: '10:30 AM', status: 'Read',  type: 'Message' },
];

// ─── ACTIVITY LOGS ─────────────────────────────────────────
export const MOCK_ACTIVITY_LOGS = [
  { id: 'log1',  action: 'Location updated at Greenfield Mall',         user: 'John Cruz',      module: 'Tracking',   status: 'Success', timestamp: mockTimestamp(timeAgo(5)),   time: '4:15 PM' },
  { id: 'log2',  action: 'Checked in at Central Station',               user: 'Maria Santos',   module: 'Attendance', status: 'Success', timestamp: mockTimestamp(timeAgo(15)),  time: '4:05 PM' },
  { id: 'log3',  action: 'Exited geofence zone at Riverside',           user: 'David Reyes',    module: 'Geofence',   status: 'Warning', timestamp: mockTimestamp(timeAgo(30)),  time: '3:50 PM' },
  { id: 'log4',  action: 'Assigned to BGC Construction Site',           user: 'Anna Lim',       module: 'Assignment', status: 'Success', timestamp: mockTimestamp(timeAgo(45)),  time: '3:35 PM' },
  { id: 'log5',  action: 'Fuel consumption updated',                    user: 'James Gonzales', module: 'Logistics',  status: 'Info',    timestamp: mockTimestamp(timeAgo(60)),  time: '3:20 PM' },
  { id: 'log6',  action: 'System backup completed',                     user: 'System',         module: 'System',     status: 'Success', timestamp: mockTimestamp(timeAgo(90)),  time: '2:50 PM' },
  { id: 'log7',  action: 'New geofence rule added to Makati Annex',     user: 'Admin User',     module: 'Geofence',   status: 'Success', timestamp: mockTimestamp(timeAgo(120)), time: '2:20 PM' },
  { id: 'log8',  action: 'Failed to sync location data',                user: 'Carlos Tan',     module: 'Tracking',   status: 'Error',   timestamp: mockTimestamp(timeAgo(150)), time: '1:50 PM' },
  { id: 'log9',  action: 'Attendance report generated',                 user: 'Sofia Martinez',  module: 'Reports',    status: 'Info',    timestamp: mockTimestamp(timeAgo(180)), time: '1:20 PM' },
  { id: 'log10', action: 'Employee profile updated',                    user: 'Admin User',     module: 'Employees',  status: 'Success', timestamp: mockTimestamp(timeAgo(240)), time: '12:20 PM' },
];

// ─── GPS HISTORY / ROUTES ───────────────────────────────────
export const MOCK_GPS_HISTORY = {
  emp1: [
    { lat: 14.610, lng: 120.985, timestamp: mockTimestamp(timeAgo(60)) },
    { lat: 14.612, lng: 120.983, timestamp: mockTimestamp(timeAgo(45)) },
    { lat: 14.615, lng: 120.980, timestamp: mockTimestamp(timeAgo(30)) },
    { lat: 14.613, lng: 120.987, timestamp: mockTimestamp(timeAgo(15)) },
    { lat: 14.610, lng: 120.985, timestamp: mockTimestamp(timeAgo(5)) },
  ],
  emp2: [
    { lat: 14.605, lng: 120.992, timestamp: mockTimestamp(timeAgo(55)) },
    { lat: 14.608, lng: 120.990, timestamp: mockTimestamp(timeAgo(40)) },
    { lat: 14.603, lng: 120.995, timestamp: mockTimestamp(timeAgo(25)) },
    { lat: 14.605, lng: 120.992, timestamp: mockTimestamp(timeAgo(10)) },
  ],
};

// ─── AI CHAT RESPONSES ─────────────────────────────────────
export const AI_RESPONSES = {
  'on site': (count) => `📍 **${count} employee(s)** currently On Site:\n\n${MOCK_EMPLOYEES.filter(e => e.status === 'On Site').map(e => `• ${e.name}`).join('\n')}`,
  'absent': (count) => `🔴 **${count} offline/absent employee(s):**\n\n${MOCK_EMPLOYEES.filter(e => e.status === 'Offline').map(e => `• ${e.name}`).join('\n')}`,
  'attendance': () => `📊 **Today's Attendance (${MOCK_ATTENDANCE.length} records):**\n\n${MOCK_ATTENDANCE.slice(0, 10).map(a => `• **${a.employee_name}** — In: ${a.check_in}, Out: ${a.check_out}`).join('\n')}`,
  'late': () => `⏰ **2 late employee(s) today:**\n\n• **Roberto Diaz** – arrived at 08:45 AM\n• **Carlos Tan** – arrived at 09:15 AM`,
  'assignment': () => `📋 **6 active assignment(s):**\n\n${MOCK_ASSIGNMENTS.filter(a => a.status === 'Active').map(a => `• **${a.empName}** → ${a.site} (${a.shift})`).join('\n')}`,
  'site': () => `🗺️ **${MOCK_SITES.length} registered site(s):**\n\n${MOCK_SITES.map(s => `• **${s.name}** — ${s.address || 'No address'}`).join('\n')}`,
  'log': () => `📝 **5 Most Recent Activity Logs:**\n\n${MOCK_ACTIVITY_LOGS.slice(0, 5).map(l => `• **${l.action}** by ${l.user} at ${l.time}`).join('\n')}`,
  'default': () => "🤔 I didn't quite understand that. Try asking:\n\n• \"Who is on site?\"\n• \"Show absent employees\"\n• \"How many active assignments?\"\n• \"Who is late today?\"\n• \"Show attendance today\"\n• \"Show recent activity logs\"",
};

// ─── AI CHAT HISTORY ───────────────────────────────────────
export const MOCK_AI_HISTORY = [
  { role: 'user', content: 'How many employees are on site today?', timestamp: timeAgo(30) },
  { role: 'assistant', content: '📍 **3 employee(s)** currently On Site:\n\n• John Cruz\n• Anna Lim\n• Isabella Torres', timestamp: timeAgo(29) },
  { role: 'user', content: 'Show me late employees', timestamp: timeAgo(25) },
  { role: 'assistant', content: '⏰ **2 late employee(s) today:**\n\n• **Roberto Diaz** – arrived at 08:45 AM\n• **Carlos Tan** – arrived at 09:15 AM', timestamp: timeAgo(24) },
];

// ─── GEOFENCE EVENTS ───────────────────────────────────────
export const MOCK_GEOFENCE_EVENTS = [
  { id: 'g1', employee: 'David Reyes',    site: 'Riverside Business Park', event: 'Exit',  time: '3:50 PM', date: 'May 22, 2026' },
  { id: 'g2', employee: 'John Cruz',      site: 'Greenfield Mall',         event: 'Entry', time: '7:05 AM', date: 'May 22, 2026' },
  { id: 'g3', employee: 'Maria Santos',   site: 'Central Station',         event: 'Entry', time: '7:55 AM', date: 'May 22, 2026' },
  { id: 'g4', employee: 'Anna Lim',       site: 'BGC Construction Site',   event: 'Exit',  time: '3:30 PM', date: 'May 21, 2026' },
];

// ─── HELPER FUNCTIONS ──────────────────────────────────────
export function getEmployees() {
  return [...MOCK_EMPLOYEES];
}

export function getSites() {
  return [...MOCK_SITES];
}

export function getAttendance() {
  return [...MOCK_ATTENDANCE];
}

export function getAssignments() {
  return [...MOCK_ASSIGNMENTS];
}

export function getActivityLogs() {
  return [...MOCK_ACTIVITY_LOGS];
}

export function getNotifications() {
  return [...MOCK_NOTIFICATIONS];
}

// Simulate server timestamp
export function serverTimestamp() {
  return mockTimestamp(new Date());
}

// Generate a new ID
let idCounter = 100;
export function generateId(prefix = 'mock') {
  return `${prefix}${++idCounter}`;
}

// Get employee by ID
export function getEmployeeById(id) {
  return MOCK_EMPLOYEES.find(e => e.id === id);
}

// Get location for employee
export function getEmployeeLocation(empId) {
  return MOCK_LOCATIONS[empId] || null;
}

// Get all employee locations
export function getAllLocations() {
  return { ...MOCK_LOCATIONS };
}