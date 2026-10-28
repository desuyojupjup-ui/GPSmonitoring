import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare, X, Bot, Send, User, Minimize2, AlertTriangle, ShieldAlert } from 'lucide-react';
import chatbotIcon from '../assets/chatbot.png';
import { db, collection, onSnapshot, query } from '../firebase';
import { resolveAssignmentStatus } from '../pages/Assignments';
import { isEmployeeOnline, resolveEmployeeStatus } from '../utils/statusUtils';

const QUICK_PROMPTS = [
  'Show detected anomalies',
  'Geofence violations',
  'Beyond shift hours',
  'Recommend actions',
  'Who is on site?',
  'Active workforce',
];

export default function FloatingChatButton() {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sites, setSites] = useState([]);
  const [logs, setLogs] = useState([]);
  const [delays, setDelays] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "👋 Hello, Admin! I'm your **SubAi Intelligence Assistant**.\n\nI continuously monitor employee telemetry, geofence perimeters, and scheduled shifts. Ask me to **explain detected anomalies**, **summarize violations**, or **recommend appropriate actions**!",
      sender: 'bot',
      time: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scrollRef = useRef();
  const inputRef = useRef();
  const location = useLocation();

  useEffect(() => {
    try {
      const unsubE = onSnapshot(query(collection(db, 'employees')), (s) =>
        setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
      const unsubA = onSnapshot(query(collection(db, 'Assignments')), (s) =>
        setAssignments(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
      const unsubAtt = onSnapshot(query(collection(db, 'attendance')), (s) =>
        setAttendance(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
      const unsubS = onSnapshot(query(collection(db, 'Sites')), (s) =>
        setSites(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => {}
      );
      const unsubL = onSnapshot(query(collection(db, 'ActivityLogs')), (s) =>
        setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => {}
      );
      const unsubD = onSnapshot(query(collection(db, 'delay_reports')), (s) =>
        setDelays(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => {}
      );
      const unsubAnom = onSnapshot(query(collection(db, 'ai_analysis')), (s) =>
        setAnomalies(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => {}
      );

      return () => {
        unsubE();
        unsubA();
        unsubAtt();
        unsubS();
        unsubL();
        unsubD();
        unsubAnom();
      };
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOpenChat = () => setOpen(true);
    window.addEventListener('subai_open_chat', handleOpenChat);
    return () => window.removeEventListener('subai_open_chat', handleOpenChat);
  }, []);

  const sendMessage = async (text = inputText) => {
    if (!text.trim()) return;
    const userMsg = { id: Date.now().toString(), text, sender: 'user', time: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      const response = processAdminQuery(text);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: response, sender: 'bot', time: new Date() },
      ]);
      setIsTyping(false);
    }, 600);
  };

  const processAdminQuery = (rawText) => {
    try {
      const text = rawText.toLowerCase().trim();

      // ── Filter active anomalies ──
      const activeAnomalies = anomalies.filter(
        (a) => a.status !== 'Resolved' && a.status !== 'Dismissed'
      );

      // 1. RECOMMEND ACTIONS / SUGGEST ACTIONS FOR ANOMALIES
      if (
        text.includes('recommend') ||
        text.includes('suggest') ||
        text.includes('action') ||
        text.includes('what should i do') ||
        text.includes('how to resolve')
      ) {
        if (activeAnomalies.length === 0) {
          return (
            "✅ **All systems clear!** No active anomalies currently require action.\n\n" +
            "💡 **General Protocol Guidance:**\n" +
            "• **Geofence Violations**: Verify employee explanation in the Anomaly Center and dispatch supervisor if unexcused.\n" +
            "• **Beyond Shift Hours**: Confirm with management whether overtime was pre-approved; perform administrative check-out if staff left without clocking out.\n" +
            "• **Mock GPS / Telemetry Drops**: Enforce biometric re-verification."
          );
        }

        const geofenceAnoms = activeAnomalies.filter(
          (a) => a.eventType === 'UNAUTHORIZED_LOCATION' || (a.type || '').includes('Geofence')
        );
        const shiftAnoms = activeAnomalies.filter(
          (a) => a.eventType === 'OVERTIME_SHIFT_EXCEEDED' || (a.type || '').includes('Overtime') || (a.description || '').includes('shift')
        );
        const otherAnoms = activeAnomalies.filter(
          (a) => !geofenceAnoms.includes(a) && !shiftAnoms.includes(a)
        );

        let response = `🛡️ **Recommended Actions for Active Anomalies (${activeAnomalies.length} Flagged):**\n\n`;

        if (geofenceAnoms.length > 0) {
          response +=
            `📍 **1. Outside Geofence Perimeter Violations (${geofenceAnoms.length} Active):**\n` +
            geofenceAnoms
              .slice(0, 3)
              .map((a) => `• **${a.employeeName}**: ${a.description}`)
              .join('\n') +
            `\n🎯 **Recommended Action Plan:**\n` +
            `  1️⃣ **Cellular Verification**: Call ${geofenceAnoms[0]?.employeeName || 'the employee'} to confirm why they stepped outside their post.\n` +
            `  2️⃣ **Review Dispute / Proof**: Check the Anomaly Center for any uploaded explanation or photo proof.\n` +
            `  3️⃣ **Live Route Inspection**: Check the **Live Tracking** map to inspect real-time coordinates.\n` +
            `  4️⃣ **Administrative Flag**: If unapproved, mark attendance as 'Flagged / Out of Bounds' for review.\n\n`;
        }

        if (shiftAnoms.length > 0) {
          response +=
            `⏰ **2. Beyond Scheduled Shift Hours (${shiftAnoms.length} Active):**\n` +
            shiftAnoms
              .slice(0, 3)
              .map((a) => `• **${a.employeeName}**: ${a.description}`)
              .join('\n') +
            `\n🎯 **Recommended Action Plan:**\n` +
            `  1️⃣ **Overtime Authorization**: Check if the extra hours were requested or approved by operations.\n` +
            `  2️⃣ **Clock-Out Reminder**: Send an in-app broadcast reminder requesting the staff to clock out.\n` +
            `  3️⃣ **Forced Administrative Check-Out**: If the employee left without clocking out, close the shift from the Attendance screen to prevent incorrect payroll records.\n\n`;
        }

        if (otherAnoms.length > 0) {
          response +=
            `⚠️ **3. Device & Verification Telemetry (${otherAnoms.length} Active):**\n` +
            otherAnoms
              .slice(0, 2)
              .map((a) => `• **${a.employeeName}**: ${a.type} (${a.description})`)
              .join('\n') +
            `\n🎯 **Recommended Action**: Request biometric face verification or inspect Fraud Reports.\n\n`;
        }

        return response;
      }

      // 2. EXPLAIN ANOMALY / SPECIFIC VIOLATION EXPLANATION
      if (
        text.includes('explain') ||
        text.includes('why') ||
        text.includes('meaning of') ||
        text.includes('details on')
      ) {
        if (text.includes('geofence') || text.includes('perimeter') || text.includes('outside')) {
          return (
            "📍 **AI Explanation: Geofence Boundary Violation**\n\n" +
            "• **What Happened**: A Fixed Site Employee checked in at their assigned post, but subsequent real-time GPS telemetry detected that their device moved outside the assigned perimeter radius.\n" +
            "• **Policy Reason**: Fixed Site staff are assigned to static client locations and must remain within the geofence perimeter throughout active shift hours.\n" +
            "• **Severity**: **High (95% Confidence)**.\n\n" +
            "💡 **Recommended Next Step**: Ask me: *'Recommend actions for geofence'* to see our operational response checklist."
          );
        }

        if (text.includes('shift') || text.includes('overtime') || text.includes('hours') || text.includes('clocked in')) {
          return (
            "⏰ **AI Explanation: Beyond Scheduled Shift Hours Violation**\n\n" +
            "• **What Happened**: An employee clocked in for their duty schedule, but remained active in the system after their scheduled shift end time without recording a Check-Out.\n" +
            "• **Policy Reason**: Unscheduled overtime creates compliance, fatigue, and payroll discrepancies unless officially pre-authorized.\n" +
            "• **Severity**: **Medium (96% Confidence)**.\n\n" +
            "💡 **Recommended Next Step**: Ask me: *'Recommend actions for shift overtime'* to see how to proceed."
          );
        }

        // Check if an employee name is mentioned
        const matchedEmp = employees.find((e) => text.includes((e.name || '').toLowerCase()));
        if (matchedEmp) {
          const empAnoms = activeAnomalies.filter(
            (a) => a.employeeId === matchedEmp.id || a.employeeName === matchedEmp.name
          );
          if (empAnoms.length === 0) {
            return `✅ **${matchedEmp.name}** has no active anomalies recorded in the system.`;
          }
          return (
            `🚨 **Active Anomalies for ${matchedEmp.name} (${empAnoms.length}):**\n\n` +
            empAnoms
              .map((a) => `• **${a.type}**: ${a.description} (${a.severity} Severity)`)
              .join('\n\n') +
            `\n\n💡 Ask me: *'Recommend actions'* for supervisor next steps.`
          );
        }

        return (
          "🔍 **AI Anomaly Interpretation Engine:**\n\n" +
          "I can explain any security or operational violation detected in the system:\n" +
          "• *'Explain geofence violation'*\n" +
          "• *'Explain beyond shift hours'*\n" +
          "• *'Explain anomaly for [Employee Name]'*\n" +
          "• *'Recommend actions'* for supervisor steps"
        );
      }

      // 3. GEOFENCE PERIMETER VIOLATIONS INQUIRY
      if (
        text.includes('geofence') ||
        text.includes('outside') ||
        text.includes('perimeter') ||
        text.includes('boundary') ||
        text.includes('out of bounds')
      ) {
        const geofenceAnoms = activeAnomalies.filter(
          (a) => a.eventType === 'UNAUTHORIZED_LOCATION' || (a.type || '').includes('Geofence')
        );

        const outsideEmps = employees.filter(
          (e) => e.geofenceStatus === 'Outside Assigned Site'
        );

        if (geofenceAnoms.length === 0 && outsideEmps.length === 0) {
          return "✅ **All Fixed Site employees are currently inside their assigned geofence perimeters!** Zero boundary breaches detected.";
        }

        let resp = `📍 **Geofence Boundary Violations (${geofenceAnoms.length} Active):**\n\n`;
        geofenceAnoms.slice(0, 5).forEach((a) => {
          resp += `• **${a.employeeName}** — ${a.description}\n  *Location: ${a.location || 'Assigned Site'} · Severity: ${a.severity}*\n\n`;
        });

        resp +=
          `💡 **AI Summary**: The system continuously tracks fixed employee coordinates throughout their shift. Employees leaving the site trigger dynamic distance alerts (e.g., 9043m away).\n\n` +
          `👉 *Ask me: 'Recommend actions' to resolve these alerts.*`;
        return resp;
      }

      // 4. BEYOND SHIFT HOURS / OVERTIME INQUIRY
      if (
        text.includes('beyond shift') ||
        text.includes('overtime') ||
        text.includes('shift exceeded') ||
        text.includes('exceeded shift') ||
        text.includes('still clocked in') ||
        text.includes('shift hour')
      ) {
        const shiftAnoms = activeAnomalies.filter(
          (a) =>
            a.eventType === 'OVERTIME_SHIFT_EXCEEDED' ||
            (a.type || '').includes('Overtime') ||
            (a.type || '').includes('Shift Exceeded') ||
            (a.description || '').includes('shift')
        );

        if (shiftAnoms.length === 0) {
          return "✅ **No employees are currently exceeding their scheduled shift hours.** All clocked-in staff are operating within their authorized shift windows.";
        }

        let resp = `⏰ **Employees Beyond Scheduled Shift Hours (${shiftAnoms.length} Active):**\n\n`;
        shiftAnoms.slice(0, 5).forEach((a) => {
          resp += `• **${a.employeeName}** — ${a.description}\n  *Location: ${a.location || 'Assigned Site'} · Confidence: ${a.confidence || '96%'}*\n\n`;
        });

        resp +=
          `💡 **AI Explanation**: These employees remain on duty past their shift end time without an approved check-out or recorded overtime authorization.\n\n` +
          `👉 *Ask me: 'Recommend actions' for administrative guidance.*`;
        return resp;
      }

      // 5. GENERAL ANOMALIES & VIOLATIONS SUMMARY
      if (
        text.includes('anomaly') ||
        text.includes('anomalies') ||
        text.includes('violation') ||
        text.includes('threat') ||
        text.includes('alert')
      ) {
        if (activeAnomalies.length === 0) {
          return (
            `✅ **Zero Active Anomalies Detected!**\n\n` +
            `The AI monitoring engine is continuously scanning:\n` +
            `• Geofence boundary exits throughout active shifts\n` +
            `• Employees clocked in beyond scheduled shift hours\n` +
            `• GPS speed jumps, mock locations, and biometric verifications\n\n` +
            `Total historical anomalies reviewed: **${anomalies.length}**.`
          );
        }

        const geofenceCount = activeAnomalies.filter(
          (a) => a.eventType === 'UNAUTHORIZED_LOCATION' || (a.type || '').includes('Geofence')
        ).length;
        const shiftCount = activeAnomalies.filter(
          (a) => a.eventType === 'OVERTIME_SHIFT_EXCEEDED' || (a.type || '').includes('Overtime') || (a.description || '').includes('shift')
        ).length;
        const otherCount = activeAnomalies.length - geofenceCount - shiftCount;

        let resp =
          `🚨 **AI Anomaly Detection Center (${activeAnomalies.length} Active Anomalies):**\n\n` +
          `• 📍 **Geofence Perimeter Breaches**: ${geofenceCount}\n` +
          `• ⏰ **Beyond Scheduled Shift Hours**: ${shiftCount}\n` +
          `• 🛡️ **Telemetry & Device Integrity**: ${otherCount}\n\n` +
          `**Latest Flagged Events:**\n`;

        activeAnomalies.slice(0, 4).forEach((a) => {
          resp += `• **${a.employeeName}** (${a.type}): ${a.description}\n`;
        });

        resp += `\n💡 *Ask me: 'Recommend actions' or 'Explain geofence violation' for more details.*`;
        return resp;
      }

      // 6. Offline / Inactive inquiry
      if (
        text.includes('offline') ||
        text.includes('absent') ||
        text.includes('not active') ||
        text.includes('inactive') ||
        text.includes('who is not here')
      ) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const offline = employees.filter((e) => !isEmployeeOnline(e));
        if (offline.length === 0) {
          return `✅ **All ${employees.length} employee(s) are currently active & online!**`;
        }
        return (
          `🔴 **${offline.length} of ${employees.length} Employee(s) Offline/Inactive:**\n\n` +
          offline
            .map(
              (e) =>
                `• **${e.name || 'Unnamed'}** — Offline (${
                  e.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site'
                })`
            )
            .join('\n')
        );
      }

      // 7. Online / Active workforce inquiry
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
        const online = employees.filter((e) => isEmployeeOnline(e));
        if (online.length === 0) {
          return `⚠️ **0 employees currently online.**\nAll ${employees.length} registered employee(s) are currently offline/inactive.`;
        }
        return (
          `🟢 **${online.length} of ${employees.length} Employee(s) Currently Online:**\n\n` +
          online
            .map((e) => {
              const status = resolveEmployeeStatus(e);
              const type = e.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site';
              const siteStr = e.assignedSite ? ` · ${e.assignedSite}` : '';
              return `• **${e.name || 'Unnamed'}** — ${status} (${type}${siteStr})`;
            })
            .join('\n')
        );
      }

      // 8. On Site inquiry
      if (text.includes('on site') || text.includes('onsite')) {
        if (employees.length === 0) return '👥 No employee records found in the database.';
        const onSite = employees.filter(
          (e) =>
            isEmployeeOnline(e) &&
            (e.status === 'On Site' || e.geofenceStatus === 'Inside Assigned Site')
        );
        if (onSite.length === 0) return '📍 **No employees are currently verified On Site.**';
        return (
          `📍 **${onSite.length} employee(s) currently On Site:**\n\n` +
          onSite
            .map((e) => `• **${e.name || 'Unnamed'}** ${e.assignedSite ? `(@ ${e.assignedSite})` : ''}`)
            .join('\n')
        );
      }

      // 9. Assignments inquiry
      if (text.includes('assignment') || text.includes('task') || text.includes('schedule')) {
        if (assignments.length === 0) return '📋 No assignments recorded in the database.';
        const active = assignments.filter((a) => resolveAssignmentStatus(a, attendance) === 'Active');
        if (active.length === 0) return '📋 No active assignments right now.';
        return (
          `📋 **${active.length} active assignment(s):**\n\n` +
          active
            .map(
              (a) =>
                `• **${a.empName || a.employeeName || 'Staff'}** → ${
                  a.site || a.siteName || a.assignedSite || 'Assigned Site'
                }`
            )
            .join('\n')
        );
      }

      // 10. Attendance inquiry
      if (
        text.includes('attendance') ||
        text.includes('present') ||
        text.includes('check in') ||
        text.includes('time in')
      ) {
        if (attendance.length === 0) return '📊 No attendance recorded yet today.';
        return (
          `📊 **Today's Attendance (${attendance.length} record${
            attendance.length > 1 ? 's' : ''
          }):**\n\n` +
          attendance
            .slice(0, 8)
            .map(
              (a) =>
                `• **${a.employee_name || a.employeeName || 'Staff'}** — In: ${
                  a.check_in || a.checkIn || '—'
                }${a.site || a.site_name ? ` (@ ${a.site || a.site_name})` : ''}`
            )
            .join('\n')
        );
      }

      // 11. Registered Sites inquiry
      if (text.includes('site') || text.includes('location')) {
        if (sites.length === 0) return '🗺️ No registered sites found in the database.';
        return (
          `🗺️ **${sites.length} Registered Site(s):**\n\n` +
          sites
            .map(
              (s) =>
                `• **${s.name || 'Site'}** — Radius: ${s.radius || 100}m (${
                  s.address || 'Geo-boundary active'
                })`
            )
            .join('\n')
        );
      }

      // 12. Delays / Incidents inquiry
      if (text.includes('delay') || text.includes('incident') || text.includes('roadblock')) {
        if (delays.length === 0) return '✅ No delay or roadblock incident reports pending.';
        return (
          `⚠️ **${delays.length} Delay/Incident Report(s):**\n\n` +
          delays
            .slice(0, 5)
            .map(
              (d) =>
                `• **${d.type || d.reason || 'Incident'}** by ${
                  d.employeeName || d.empName || 'Staff'
                } — ${d.status || 'Pending'}`
            )
            .join('\n')
        );
      }

      return (
        "🤖 **I can help you monitor and manage ground operations:**\n\n" +
        "• **'Show detected anomalies'** — View all active violations\n" +
        "• **'Geofence violations'** — Fixed site perimeter breach status\n" +
        "• **'Beyond shift hours'** — Staff clocked in past shift end time\n" +
        "• **'Recommend actions'** — Operational guidance for supervisors\n" +
        "• **'Who is online?'** / **'Who is on site?'** — Live workforce telemetry\n" +
        "• **'Active assignments'** — Current shift assignments"
      );
    } catch (e) {
      console.error(e);
      return '⚠️ Error processing request. Please try again.';
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
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            right: 28,
            zIndex: 9998,
            width: 380,
            height: 550,
            background: 'white',
            borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #E5E7EB',
            animation: 'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'linear-gradient(135deg,#4F46E5,#6366F1)',
              borderRadius: '20px 20px 0 0',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src={chatbotIcon} alt="Bot" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>SubAi Assistant</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', display: 'inline-block' }}></span>
                AI Telemetry & Anomaly Supervisor
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: 'white',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Quick Prompts Bar */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #F1F5F9',
              background: '#F8FAFC',
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(prompt)}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: prompt.includes('anomalies') || prompt.includes('violations') ? '#FEF2F2' : '#EFF6FF',
                  border: `1px solid ${prompt.includes('anomalies') || prompt.includes('violations') ? '#FCA5A5' : '#BFDBFE'}`,
                  color: prompt.includes('anomalies') || prompt.includes('violations') ? '#991B1B' : '#1D4ED8',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Body */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start',
                  gap: 8,
                }}
              >
                {m.sender === 'bot' && (
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      background: '#EEF2FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <img src={chatbotIcon} alt="Bot" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  </div>
                )}
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '10px 14px',
                    borderRadius: m.sender === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    background: m.sender === 'user' ? '#4F46E5' : '#F8FAFC',
                    color: m.sender === 'user' ? 'white' : '#1F2937',
                    fontSize: 12.5,
                    lineHeight: '18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    border: m.sender === 'bot' ? '1px solid #E2E8F0' : 'none',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {formatText(m.text)}
                </div>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    background: '#EEF2FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img src={chatbotIcon} alt="Bot" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                </div>
                <div style={{ padding: '8px 14px', background: '#F3F4F6', borderRadius: 14, fontSize: 12, color: '#6B7280' }}>
                  SubAi is analyzing telemetry...
                </div>
              </div>
            )}
          </div>

          {/* Input Row */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about anomalies, shifts, geofences..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              style={{
                flex: 1,
                border: '1px solid #E2E8F0',
                borderRadius: 20,
                padding: '9px 14px',
                fontSize: 12.5,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!inputText.trim()}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: inputText.trim() ? '#4F46E5' : '#E0E7FF',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: inputText.trim() ? 'pointer' : 'default',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <div
        onClick={() => setOpen((prev) => !prev)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 28,
          zIndex: 9999,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
            boxShadow: hovered ? '0 12px 30px rgba(79,70,229,0.5)' : '0 6px 20px rgba(79,70,229,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
            position: 'relative',
          }}
        >
          <img
            src={chatbotIcon}
            alt="Chatbot"
            style={{ width: '65%', height: '65%', objectFit: 'contain' }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#10B981',
              border: '2px solid white',
            }}
          />
        </div>
      </div>
    </>
  );
}