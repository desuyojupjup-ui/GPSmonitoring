import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, BarChart2, Users, MapPin, Clock, AlertCircle } from 'lucide-react';
import { db, collection, onSnapshot, query } from '../firebase';
import { resolveAssignmentStatus } from './Assignments';

function isEmployeeOnline(emp) {
  if (!emp) return false;
  if (emp.isOnline === false) return false;

  const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen;
  if (rawTime) {
    const ts = typeof rawTime === 'number'
      ? rawTime
      : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
    if (ts && !isNaN(ts)) {
      return (Date.now() - ts) <= 120000;
    }
  }

  if (emp.isOnline === true) {
    if (emp.lastLogin) {
      const loginTs = new Date(emp.lastLogin).getTime();
      if (loginTs && !isNaN(loginTs)) {
        return (Date.now() - loginTs) <= 120000;
      }
    }
    return true;
  }

  return false;
}

function resolveEmployeeStatus(emp) {
  if (!isEmployeeOnline(emp)) return 'Offline';
  if (emp.status === 'On Site' || emp.geofenceStatus === 'Inside Assigned Site') return 'On Site';
  if (emp.status === 'In Transit') return 'In Transit';
  return (emp.status && emp.status !== 'Offline') ? emp.status : 'On Duty';
}

const QUICK_PROMPTS = [
  { label: '🔴 Offline employees', query: 'who is offline' },
  { label: '🟢 Online workforce', query: 'who is online' },
  { label: '👥 Employees on site', query: 'how many employees are on site' },
  { label: '📋 Active assignments', query: 'show active assignments' },
  { label: '📊 Attendance today', query: 'show attendance today' },
  { label: '🗺️ Registered sites', query: 'show registered sites' },
  { label: '📝 Recent logs', query: 'show recent activity logs' },
];

export default function AIAssistant() {
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sites, setSites] = useState([]);
  const [logs, setLogs] = useState([]);

  const [messages, setMessages] = useState([
    {
      id: '1',
      text: '👋 Hello, Admin! I\'m your **SubAi Assistant**. I have full access to your live database. Ask me anything!\n\n**Try:**\n• "Who is offline today?"\n• "Who is online?"\n• "How many employees are on site?"\n• "Show active assignments"\n• "Which sites are registered?"',
      sender: 'bot',
      time: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef();

  useEffect(() => {
    try {
      const unsubE = onSnapshot(query(collection(db, 'employees')), s => setEmployees(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubA = onSnapshot(query(collection(db, 'Assignments')), s => setAssignments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubAtt = onSnapshot(query(collection(db, 'attendance')), s => setAttendance(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubS = onSnapshot(query(collection(db, 'Sites')), s => setSites(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubL = onSnapshot(query(collection(db, 'ActivityLogs')), s => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      return () => { unsubE(); unsubA(); unsubAtt(); unsubS(); unsubL(); };
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text = inputText) => {
    if (!text.trim()) return;
    const userMsg = { id: Date.now().toString(), text, sender: 'user', time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      const response = processAdminQuery(text);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: response, sender: 'bot', time: new Date() }]);
      setIsTyping(false);
    }, 700);
  };

  const processAdminQuery = (rawText) => {
    try {
      const text = rawText.toLowerCase().trim();

      // 1. Offline / Absent
      if (
        text.includes('offline') ||
        text.includes('absent') ||
        text.includes('not active') ||
        text.includes('inactive') ||
        text.includes('who is not here')
      ) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const offline = employees.filter(e => !isEmployeeOnline(e));
        if (offline.length === 0) return `✅ **All ${employees.length} employees are currently active & online!**`;
        return (
          `🔴 **${offline.length} of ${employees.length} Employee(s) Offline/Inactive:**\n\n` +
          offline.map(e => `• **${e.name || 'Unnamed'}** — Offline (${e.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site'})`).join('\n')
        );
      }

      // 2. Online / Active / Working
      if (
        text.includes('online') ||
        text.includes('on duty') ||
        text.includes('who is active') ||
        text.includes('active employee') ||
        text.includes('active workforce') ||
        text === 'active' ||
        text.includes('who is working')
      ) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const online = employees.filter(isEmployeeOnline);
        if (online.length === 0) {
          return `⚠️ **0 employees currently online.**\nAll ${employees.length} registered employee(s) are currently offline/inactive.`;
        }
        return (
          `🟢 **${online.length} of ${employees.length} Employee(s) Currently Online:**\n\n` +
          online.map(e => {
            const status = resolveEmployeeStatus(e);
            const type = e.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site';
            const siteStr = e.assignedSite ? ` · ${e.assignedSite}` : '';
            return `• **${e.name || 'Unnamed'}** — ${status} (${type}${siteStr})`;
          }).join('\n')
        );
      }

      // 3. On Site
      if (text.includes('on site') || text.includes('onsite')) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const onSite = employees.filter(e => isEmployeeOnline(e) && (e.status === 'On Site' || e.geofenceStatus === 'Inside Assigned Site'));
        if (onSite.length === 0) return '📍 **No employees are currently verified On Site.**';
        return (
          `📍 **${onSite.length} employee(s)** currently On Site:\n\n` +
          onSite.map(e => `• **${e.name || 'Unnamed'}** ${e.assignedSite ? `(@ ${e.assignedSite})` : ''}`).join('\n')
        );
      }

      // 4. Assignments
      if (text.includes('assignment') || text.includes('task') || text.includes('schedule')) {
        if (assignments.length === 0) return '📋 No assignments recorded in the database.';
        const active = assignments.filter(a => resolveAssignmentStatus(a) === 'Active');
        if (active.length === 0) return '📋 No active assignments right now.';
        return (
          `📋 **${active.length} active assignment(s):**\n\n` +
          active.map(a => `• **${a.empName || a.employeeName || 'Staff'}** → ${a.site || a.siteName || a.assignedSite || 'Assigned Site'}`).join('\n')
        );
      }

      // 5. Attendance
      if (text.includes('attendance') || text.includes('present') || text.includes('check in') || text.includes('time in')) {
        if (attendance.length === 0) return '📊 No attendance recorded yet today.';
        return (
          `📊 **Today's Attendance (${attendance.length} records):**\n\n` +
          attendance.slice(0, 10).map(a => `• **${a.employee_name || a.employeeName || 'Staff'}** — In: ${a.check_in || a.checkIn || '—'}${a.site || a.site_name ? ` (@ ${a.site || a.site_name})` : ''}`).join('\n')
        );
      }

      // 6. Registered Sites
      if (text.includes('site') || text.includes('geofence')) {
        if (sites.length === 0) return '🗺️ No registered sites found in the database.';
        return (
          `🗺️ **${sites.length} registered site(s):**\n\n` +
          sites.map(s => `• **${s.name || 'Site'}** — Radius: ${s.radius || 100}m (${s.address || 'Geo-boundary active'})`).join('\n')
        );
      }

      // 7. Recent logs
      if (text.includes('log') || text.includes('recent') || text.includes('activity')) {
        if (logs.length === 0) return '📝 No activity logs recorded yet.';
        return (
          `📝 **Recent Activity Logs:**\n\n` +
          logs.slice(0, 5).map(l => `• **${l.action || l.type || 'Activity'}** by ${l.user || l.userName || l.employeeName || 'System'}${l.details ? ` (${l.details})` : ''}`).join('\n')
        );
      }

      return (
        "🤔 I didn't quite understand that. Try asking:\n\n" +
        "• \"Who is offline?\"\n" +
        "• \"Who is online?\"\n" +
        "• \"Who is on site?\"\n" +
        "• \"Show active assignments\"\n" +
        "• \"Show attendance today\"\n" +
        "• \"Show registered sites\""
      );
    } catch (e) {
      console.error(e);
      return '⚠️ An error occurred while processing your request.';
    }
  };

  const formatMessage = (text) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <span key={i} style={{ fontWeight: 700, color: '#1F2937' }}>{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', gap: 0 }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, flex: 1, minHeight: 0 }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(79,70,229,0.07)', border: '1px solid #E5E7EB' }}>
          
          <div style={{ background: 'linear-gradient(135deg, #4F46E5, #6366F1)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={22} color="white" />
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>SubAi Assistant</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
                Online · Live Database Connected
              </div>
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: '#F9FAFB' }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', gap: 10 }}>
                {msg.sender === 'bot' && (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={16} color="white" />
                  </div>
                )}
                <div style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.sender === 'user' ? '#4F46E5' : 'white',
                  color: msg.sender === 'user' ? 'white' : '#374151',
                  fontSize: 14,
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: msg.sender === 'bot' ? '1px solid #E5E7EB' : 'none'
                }}>
                  {msg.sender === 'bot' ? formatMessage(msg.text) : msg.text}
                  <div style={{ fontSize: 10, color: msg.sender === 'user' ? 'rgba(255,255,255,0.6)' : '#9CA3AF', marginTop: 6, textAlign: 'right' }}>
                    {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={16} color="#4F46E5" />
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={16} color="white" />
                </div>
                <div style={{ background: 'white', padding: '12px 16px', borderRadius: '18px 18px 18px 4px', border: '1px solid #E5E7EB', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F46E5', animation: 'bounce 1s infinite', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E7EB', background: 'white', display: 'flex', gap: 10 }}>
            <input
              placeholder="Ask about employees, attendance, sites..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 24, padding: '10px 16px', fontSize: 14, outline: 'none', color: '#1F2937', background: '#F9FAFB' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!inputText.trim()}
              style={{ width: 44, height: 44, borderRadius: '50%', background: inputText.trim() ? '#4F46E5' : '#E5E7EB', border: 'none', cursor: inputText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            >
              <Send size={18} color={inputText.trim() ? 'white' : '#9CA3AF'} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 14 }}>⚡ Quick Queries</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => sendMessage(p.query)} style={{ textAlign: 'left', padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#FAFAFA', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#C7D2FE'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#E5E5E5'; }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}