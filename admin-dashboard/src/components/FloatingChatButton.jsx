import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare, X, Bot, Send, User, Minimize2 } from 'lucide-react';
import { MOCK_EMPLOYEES, MOCK_ATTENDANCE, MOCK_ASSIGNMENTS, MOCK_SITES, MOCK_ACTIVITY_LOGS } from '../mockData';
import chatbotIcon from '../assets/chatbot.png';

const QUICK_PROMPTS = [
  'Who is on site?',
  'Who is absent?',
  'Who is late today?',
  'Active assignments',
  'Attendance today',
  'Recent activity logs',
];

export default function FloatingChatButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "👋 Hello, Admin! I'm your **GeoStride AI**.\n\nAsk me about employees, attendance, assignments, or site activity!",
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

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
    }, 1100);
  };

  const processAdminQuery = (text) => {
    try {
      if (text.includes('on site') || text.includes('how many')) {
        const onSite = MOCK_EMPLOYEES.filter(e => e.status === 'On Site');
        if (onSite.length === 0) return '📍 No employees are currently on site.';
        return `📍 **${onSite.length} employee(s) On Site:**\n${onSite.map(e => `• ${e.name}`).join('\n')}`;
      }
      if (text.includes('absent') || text.includes('offline')) {
        const offline = MOCK_EMPLOYEES.filter(e => e.status === 'Offline');
        if (offline.length === 0) return '✅ All employees are currently active!';
        return `🔴 **${offline.length} Offline/Absent:**\n${offline.map(e => `• ${e.name}`).join('\n')}`;
      }
      if (text.includes('late')) {
        return '⏰ **2 late today:**\n• Roberto Diaz (08:45 AM)\n• Carlos Tan (09:15 AM)';
      }
      if (text.includes('assignment') || text.includes('active')) {
        const active = MOCK_ASSIGNMENTS.filter(a => a.status === 'Active');
        if (active.length === 0) return '📋 No active assignments right now.';
        return `📋 **${active.length} active assignment(s):**\n${active.map(a => `• ${a.empName} → ${a.site}`).join('\n')}`;
      }
      if (text.includes('attendance')) {
        return `📊 **Today's Attendance (${MOCK_ATTENDANCE.length}):**\n${MOCK_ATTENDANCE.slice(0, 8).map(a => `• ${a.employee_name} — In: ${a.check_in}`).join('\n')}`;
      }
      if (text.includes('log') || text.includes('recent') || text.includes('activity')) {
        return `📝 **Recent Logs:**\n${MOCK_ACTIVITY_LOGS.slice(0, 5).map(l => `• ${l.action} at ${l.time}`).join('\n')}`;
      }
      if (text.includes('site')) {
        return `🗺️ **${MOCK_SITES.length} Site(s):**\n${MOCK_SITES.map(s => `• ${s.name}`).join('\n')}`;
      }
      return "I can help with:\n• 'Who is on site?'\n• 'Who is absent?'\n• 'Who is late today?'\n• 'Active assignments'\n• 'Attendance today'\n• 'Recent logs'";
    } catch (e) {
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
              <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>GeoStride AI</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
                Online · Demo Mode
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
            {QUICK_PROMPTS.slice(0,4).map((p, i) => (
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

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes floatIcon {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}