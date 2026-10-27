import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare, X, Bot, Send, User, Minimize2 } from 'lucide-react';
import chatbotIcon from '../assets/chatbot.png';
import { db, collection, onSnapshot, query } from '../firebase';
import { resolveAssignmentStatus } from '../pages/Assignments';

export function isEmployeeOnline(emp) {
  if (!emp) return false;
  if (emp.isOnline === false) return false;

  const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen;
  if (rawTime) {
    const ts = typeof rawTime === 'number'
      ? rawTime
      : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
    if (ts && !isNaN(ts)) {
      return (Date.now() - ts) <= 120000; // 2 minutes active window
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

export function resolveEmployeeStatus(emp) {
  if (!isEmployeeOnline(emp)) return 'Offline';
  if (emp.status === 'On Site' || emp.geofenceStatus === 'Inside Assigned Site') return 'On Site';
  if (emp.status === 'In Transit') return 'In Transit';
  return (emp.status && emp.status !== 'Offline') ? emp.status : 'On Duty';
}

const QUICK_PROMPTS = [
  'Who is on site?',
  'Who is offline?',
  'Who is online?',
  'Active assignments',
  'Attendance today',
  'Recent activity logs',
];

export default function FloatingChatButton() {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sites, setSites] = useState([]);
  const [logs, setLogs] = useState([]);
  const [delays, setDelays] = useState([]);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "👋 Hello, Admin! I'm your **SubAi**.\n\nAsk me about employees, attendance, assignments, or site activity!",
      sender: 'bot',
      time: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scrollRef = useRef();
  const inputRef = useRef();
  const location = useLocation();

  useEffect(() => {
    try {
      const unsubE = onSnapshot(query(collection(db, 'employees')), (s) => setEmployees(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubA = onSnapshot(query(collection(db, 'Assignments')), (s) => setAssignments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubAtt = onSnapshot(query(collection(db, 'attendance')), (s) => setAttendance(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubS = onSnapshot(query(collection(db, 'Sites')), (s) => setSites(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      const unsubL = onSnapshot(query(collection(db, 'ActivityLogs')), (s) => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      const unsubD = onSnapshot(query(collection(db, 'delay_reports')), (s) => setDelays(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      return () => { unsubE(); unsubA(); unsubAtt(); unsubS(); unsubL(); unsubD(); };
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handleOpenChat = () => setOpen(true);
    window.addEventListener('subai_open_chat', handleOpenChat);
    return () => window.removeEventListener('subai_open_chat', handleOpenChat);
  }, []);

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
    }, 600);
  };

  const processAdminQuery = (rawText) => {
    try {
      const text = rawText.toLowerCase().trim();

      // 1. Offline / Absent inquiry
      if (
        text.includes('offline') ||
        text.includes('absent') ||
        text.includes('not active') ||
        text.includes('inactive') ||
        text.includes('who is not here')
      ) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const offline = employees.filter(e => !isEmployeeOnline(e));
        if (offline.length === 0) {
          return `✅ **All ${employees.length} employee(s) are currently active & online!**`;
        }
        return (
          `🔴 **${offline.length} of ${employees.length} Employee(s) Offline/Inactive:**\n\n` +
          offline
            .map(e => `• **${e.name || 'Unnamed'}** — Offline (${e.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site'})`)
            .join('\n')
        );
      }

      // 2. Online / Active / On Duty inquiry
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
          online
            .map(e => {
              const status = resolveEmployeeStatus(e);
              const type = e.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site';
              const siteStr = e.assignedSite ? ` · ${e.assignedSite}` : '';
              return `• **${e.name || 'Unnamed'}** — ${status} (${type}${siteStr})`;
            })
            .join('\n')
        );
      }

      // 3. On Site inquiry
      if (text.includes('on site') || text.includes('onsite')) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const onSite = employees.filter(
          e => isEmployeeOnline(e) && (e.status === 'On Site' || e.geofenceStatus === 'Inside Assigned Site')
        );
        if (onSite.length === 0) return '📍 **No employees are currently verified On Site.**';
        return (
          `📍 **${onSite.length} employee(s) currently On Site:**\n\n` +
          onSite.map(e => `• **${e.name || 'Unnamed'}** ${e.assignedSite ? `(@ ${e.assignedSite})` : ''}`).join('\n')
        );
      }

      // 4. Assignments inquiry
      if (text.includes('assignment') || text.includes('task') || text.includes('schedule')) {
        if (assignments.length === 0) return '📋 No assignments recorded in the database.';
        const active = assignments.filter(a => resolveAssignmentStatus(a) === 'Active');
        if (active.length === 0) return '📋 No active assignments right now.';
        return (
          `📋 **${active.length} active assignment(s):**\n\n` +
          active.map(a => `• **${a.empName || a.employeeName || 'Staff'}** → ${a.site || a.siteName || a.assignedSite || 'Assigned Site'}`).join('\n')
        );
      }

      // 5. Attendance inquiry
      if (text.includes('attendance') || text.includes('present') || text.includes('check in') || text.includes('time in')) {
        if (attendance.length === 0) return '📊 No attendance recorded yet today.';
        return (
          `📊 **Today's Attendance (${attendance.length} record${attendance.length > 1 ? 's' : ''}):**\n\n` +
          attendance.slice(0, 8).map(a => `• **${a.employee_name || a.employeeName || 'Staff'}** — In: ${a.check_in || a.checkIn || '—'}${a.site || a.site_name ? ` (@ ${a.site || a.site_name})` : ''}`).join('\n')
        );
      }

      // 6. Registered Sites inquiry
      if (text.includes('site') || text.includes('geofence')) {
        if (sites.length === 0) return '🗺️ No registered sites found in the database.';
        return (
          `🗺️ **${sites.length} Registered Site(s):**\n\n` +
          sites.map(s => `• **${s.name || 'Site'}** — Radius: ${s.radius || 100}m (${s.address || 'Geo-boundary active'})`).join('\n')
        );
      }

      // 7. Recent activity logs inquiry
      if (text.includes('log') || text.includes('recent') || text.includes('activity')) {
        if (logs.length === 0) return '📝 No activity logs recorded yet.';
        return (
          `📝 **Recent Activity Logs:**\n\n` +
          logs.slice(0, 5).map(l => `• **${l.action || l.type || 'Activity'}** — ${l.user || l.userName || l.employeeName || 'System'}${l.details ? ` (${l.details})` : ''}`).join('\n')
        );
      }

      // 8. Delays / Incidents inquiry
      if (text.includes('delay') || text.includes('incident') || text.includes('roadblock')) {
        if (delays.length === 0) return '✅ No delay or roadblock incident reports pending.';
        return (
          `⚠️ **${delays.length} Delay/Incident Report(s):**\n\n` +
          delays.slice(0, 5).map(d => `• **${d.type || d.reason || 'Incident'}** by ${d.employeeName || d.empName || 'Staff'} — ${d.status || 'Pending'}`).join('\n')
        );
      }

      return (
        "I can help with:\n" +
        "• 'Who is offline?'\n" +
        "• 'Who is online?'\n" +
        "• 'Who is on site?'\n" +
        "• 'Active assignments'\n" +
        "• 'Attendance today'\n" +
        "• 'Recent activity logs'\n" +
        "• 'Registered sites'"
      );
    } catch (e) {
      console.error(e);
      return '⚠️ Error processing request.';
    }
  };

  const formatText = (text) => {
    return text.split(/\*\*(.*?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
    );
  };

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 28, zIndex: 9998,
          width: 360, height: 520, background: 'white', borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          border: '1px solid #E5E7EB',
          animation: 'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)'
        }}>
          <div style={{ background: 'linear-gradient(135deg,#4F46E5,#6366F1)', borderRadius: '20px 20px 0 0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={chatbotIcon} alt="Bot" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>SubAi</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
                Online · Live Database
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
              <Minimize2 size={15} color="white" />
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9FAFB' }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                {msg.sender === 'bot' && (
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <img src={chatbotIcon} alt="Bot" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  </div>
                )}
                <div style={{
                  maxWidth: '78%', padding: '10px 13px', fontSize: 13, lineHeight: '1.55',
                  borderRadius: msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.sender === 'user' ? '#4F46E5' : 'white',
                  color: msg.sender === 'user' ? 'white' : '#374151',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  whiteSpace: 'pre-wrap',
                  border: msg.sender === 'bot' ? '1px solid #E5E7EB' : 'none'
                }}>
                  {msg.sender === 'bot' ? formatText(msg.text) : msg.text}
                </div>
                {msg.sender === 'user' && (
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={13} color="#4F46E5" />
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: 13, background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={chatbotIcon} alt="Bot" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                </div>
                <div style={{ background: 'white', border: '1px solid #E5E7EB', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#4F46E5', animation: 'bounce 1s infinite', animationDelay: `${i*0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 14px 4px', display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
            {QUICK_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => sendMessage(p)} style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 600, color: '#4F46E5', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ padding: '8px 12px 12px', display: 'flex', gap: 8, borderTop: '1px solid #F3F4F6' }}>
            <input
              ref={inputRef}
              placeholder="Ask me anything..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              style={{ flex: 1, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none', color: '#1F2937' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!inputText.trim()}
              style={{ width: 38, height: 38, borderRadius: 19, background: inputText.trim() ? '#4F46E5' : '#E5E7EB', border: 'none', cursor: inputText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}
            >
              <Send size={15} color={inputText.trim() ? 'white' : '#9CA3AF'} />
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {!open && hovered && (
          <div style={{ background: '#1F2937', color: 'white', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeIn 0.15s ease' }}>
            💬 Ask AI Assistant
          </div>
        )}
        <button
          onClick={() => { setOpen(prev => !prev); setTimeout(() => inputRef.current?.focus(), 300); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: 70, height: 70,
            background: 'transparent',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
            transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            animation: 'floatIcon 2.5s ease-in-out infinite'
          }}
        >
          <img src={chatbotIcon} alt="Chatbot" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </button>
      </div>
    </>
  );
}