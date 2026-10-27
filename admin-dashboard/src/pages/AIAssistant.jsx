import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, BarChart2, Users, MapPin, Clock, AlertCircle } from 'lucide-react';
import { db, collection, onSnapshot, query } from '../firebase';

const QUICK_PROMPTS = [
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
      text: '👋 Hello, Admin! I\'m your **GeoStride AI Assistant**. I have full access to your live database. Ask me anything!\n\n**Try:**\n• "Who is offline today?"\n• "How many employees are on site?"\n• "Show active assignments"\n• "Which sites are registered?"',
      sender: 'bot',
      time: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef();

  useEffect(() => {
    try {
      const unsubE = onSnapshot(query(collection(db, 'employees')), s => setEmployees(s.docs.map(d => d.data())));
      const unsubA = onSnapshot(query(collection(db, 'Assignments')), s => setAssignments(s.docs.map(d => d.data())));
      const unsubAtt = onSnapshot(query(collection(db, 'attendance')), s => setAttendance(s.docs.map(d => d.data())));
      const unsubS = onSnapshot(query(collection(db, 'Sites')), s => setSites(s.docs.map(d => d.data())));
      const unsubL = onSnapshot(query(collection(db, 'tracking_logs')), s => setLogs(s.docs.map(d => d.data())));
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
      const response = processAdminQuery(text.toLowerCase());
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: response, sender: 'bot', time: new Date() }]);
      setIsTyping(false);
    }, 900);
  };

  const processAdminQuery = (text) => {
    try {
      if (text.includes('on site') || text.includes('how many')) {
        const onSite = employees.filter(e => e.status === 'On Site');
        if (onSite.length === 0) return '📍 No employees are currently on site.';
        return `📍 **${onSite.length} employee(s)** currently On Site:\n\n${onSite.map(e => `• ${e.name}`).join('\n')}`;
      }

      if (text.includes('absent') || text.includes('offline')) {
        const offline = employees.filter(e => e.status === 'Offline' || !e.status);
        if (offline.length === 0) return '✅ All employees are currently active!';
        return `🔴 **${offline.length} offline/absent employee(s):**\n\n${offline.map(e => `• ${e.name}`).join('\n')}`;
      }

      if (text.includes('assignment') || text.includes('active')) {
        const active = assignments.filter(a => a.status === 'Active');
        if (active.length === 0) return '📋 No active assignments right now.';
        return `📋 **${active.length} active assignment(s):**\n\n${active.map(a => `• **${a.empName || a.employeeName}** → ${a.site || a.siteName}`).join('\n')}`;
      }

      if (text.includes('attendance')) {
        if (attendance.length === 0) return '📊 No attendance recorded yet today.';
        return `📊 **Today's Attendance (${attendance.length} records):**\n\n${attendance.slice(0, 10).map(a => `• **${a.employee_name || a.employeeName}** — In: ${a.check_in || a.checkIn || '—'}`).join('\n')}`;
      }

      if (text.includes('site')) {
        if (sites.length === 0) return '🗺️ No sites registered yet.';
        return `🗺️ **${sites.length} registered site(s):**\n\n${sites.map(s => `• **${s.name}** — ${s.address || 'No address'}`).join('\n')}`;
      }

      if (text.includes('log') || text.includes('recent') || text.includes('activity')) {
        if (logs.length === 0) return '📝 No activity logs recorded yet.';
        return `📝 **5 Most Recent Activity Logs:**\n\n${logs.slice(0, 5).map(l => `• **${l.action || l.type || 'Activity'}** by ${l.user || l.employeeName || 'System'}`).join('\n')}`;
      }

      return "🤔 I didn't quite understand that. Try asking:\n\n• \"Who is on site?\"\n• \"Show absent employees\"\n• \"How many active assignments?\"\n• \"Show attendance today\"\n• \"Show registered sites\"";
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
              <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>GeoStride AI Assistant</div>
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