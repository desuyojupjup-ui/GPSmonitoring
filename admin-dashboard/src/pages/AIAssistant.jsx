import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Mic, Paperclip, BarChart2, Users, MapPin, Clock, AlertCircle } from 'lucide-react';
import { AI_RESPONSES, MOCK_EMPLOYEES, MOCK_ATTENDANCE, MOCK_ASSIGNMENTS, MOCK_SITES, MOCK_ACTIVITY_LOGS } from '../mockData';

const QUICK_PROMPTS = [
  { label: '👥 Employees on site', query: 'how many employees are on site' },
  { label: '📋 Active assignments', query: 'show active assignments' },
  { label: '⏰ Late today', query: 'who is late today' },
  { label: '📊 Attendance today', query: 'show attendance today' },
  { label: '🗺️ Site activity', query: 'show site activity' },
  { label: '📝 Recent logs', query: 'show recent activity logs' },
];

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: '👋 Hello, Admin! I\'m your **GeoStride AI Assistant**. I have full access to your workforce data. Ask me anything!\n\n**Try:**\n• "Who is absent today?"\n• "How many employees are on site?"\n• "Show late employees"\n• "Which site has the most activity?"',
      sender: 'bot',
      time: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef();

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
    }, 1200);
  };

  const processAdminQuery = (text) => {
    try {
      if (text.includes('on site') || text.includes('how many')) {
        const onSite = MOCK_EMPLOYEES.filter(e => e.status === 'On Site');
        if (onSite.length === 0) return '📍 No employees are currently on site.';
        return `📍 **${onSite.length} employee(s)** currently On Site:\n\n${onSite.map(e => `• ${e.name}`).join('\n')}`;
      }

      if (text.includes('absent') || text.includes('offline')) {
        const offline = MOCK_EMPLOYEES.filter(e => e.status === 'Offline');
        if (offline.length === 0) return '✅ All employees are currently active!';
        return `🔴 **${offline.length} offline/absent employee(s):**\n\n${offline.map(e => `• ${e.name}`).join('\n')}`;
      }

      if (text.includes('assignment') || text.includes('active')) {
        const active = MOCK_ASSIGNMENTS.filter(a => a.status === 'Active');
        if (active.length === 0) return '📋 No active assignments right now.';
        return `📋 **${active.length} active assignment(s):**\n\n${active.map(a => `• **${a.empName}** → ${a.site} (${a.shift || 'N/A'})`).join('\n')}`;
      }

      if (text.includes('late')) {
        return '⏰ **2 late employee(s) today:**\n\n• **Roberto Diaz** – arrived at 08:45 AM\n• **Carlos Tan** – arrived at 09:15 AM';
      }

      if (text.includes('attendance')) {
        return `📊 **Today's Attendance (${MOCK_ATTENDANCE.length} records):**\n\n${MOCK_ATTENDANCE.slice(0, 10).map(a => `• **${a.employee_name}** — In: ${a.check_in}, Out: ${a.check_out}`).join('\n')}`;
      }

      if (text.includes('site')) {
        return `🗺️ **${MOCK_SITES.length} registered site(s):**\n\n${MOCK_SITES.map(s => `• **${s.name}** — ${s.address || 'No address'}`).join('\n')}`;
      }

      if (text.includes('log') || text.includes('recent') || text.includes('activity')) {
        return `📝 **5 Most Recent Activity Logs:**\n\n${MOCK_ACTIVITY_LOGS.slice(0, 5).map(l => `• **${l.action}** by ${l.user} at ${l.time}`).join('\n')}`;
      }

      if (text.includes('where') || text.includes('location') || text.includes('gps')) {
        const activeLoc = MOCK_EMPLOYEES.filter(e => e.status !== 'Offline');
        return `📡 **Latest GPS Activity:**\n\n${activeLoc.map(e => `• **${e.name}** — Last seen at just now`).join('\n')}`;
      }

      return "🤔 I didn't quite understand that. Try asking:\n\n• \"Who is on site?\"\n• \"Show absent employees\"\n• \"How many active assignments?\"\n• \"Who is late today?\"\n• \"Show attendance today\"\n• \"Show recent activity logs\"";
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
                Online · Demo Mode
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
                  onMouseLeave={e => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#E5E7EB'; }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 14 }}>🤖 Capabilities</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: <Users size={14} />, label: 'Employee Status', color: '#4F46E5', bg: '#EEF2FF' },
                { icon: <Clock size={14} />, label: 'Attendance Queries', color: '#10B981', bg: '#ECFDF5' },
                { icon: <MapPin size={14} />, label: 'Site & GPS Info', color: '#F59E0B', bg: '#FEF3C7' },
                { icon: <BarChart2 size={14} />, label: 'Assignment Reports', color: '#3B82F6', bg: '#DBEAFE' },
                { icon: <AlertCircle size={14} />, label: 'Activity Logs', color: '#EF4444', bg: '#FEE2E2' },
              ].map((cap, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: cap.bg, color: cap.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cap.icon}
                  </div>
                  <span style={{ fontSize: 13, color: '#4B5563', fontWeight: 500 }}>{cap.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}