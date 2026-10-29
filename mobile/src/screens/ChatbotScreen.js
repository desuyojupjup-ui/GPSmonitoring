import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { auth, db, collection, query, where, getDocs, getCleanEmployeeEmail } from '../firebase';
import { getChatbotAssignmentContext, personalizeAnomalyDescription, personalizeAnomalyTitle } from '../utils/assignmentUtils';

const VOICE_COMMANDS = [
  { id: 'vc1', label: 'What is my assignment?', query: 'What is my assignment?' },
  { id: 'vc2', label: 'Where is my site?', query: 'Where is my site location?' },
  { id: 'vc3', label: 'What time did I check in?', query: 'What time did I check in?' },
  { id: 'vc4', label: 'Show my attendance', query: 'How many attendances?' },
  { id: 'vc5', label: 'What is my status?', query: 'What is my status?' },
  { id: 'vc6', label: 'Check my anomaly alerts', query: 'Do I have any anomalies?' },
];

export default function ChatbotScreen({ route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! I am your SubAi Assistant. Ask me about your assignments, site locations, attendance, or tap the microphone button for Voice Commands.', sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);

  const scrollViewRef = useRef();

  // Radar Pulse Animation for Voice Listening
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let loopAnim = null;
    if (isVoiceListening) {
      pulse.setValue(1);
      pulseOpacity.setValue(0.6);
      loopAnim = Animated.loop(
        Animated.parallel([
          Animated.timing(pulse, { toValue: 2.2, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      );
      loopAnim.start();
    } else {
      pulse.setValue(1);
    }
    return () => { if (loopAnim) loopAnim.stop(); };
  }, [isVoiceListening]);

  useEffect(() => {
    return () => {
      try { Speech.stop(); } catch (e) {}
    };
  }, []);

  const email = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);

  const cleanTextForSpeech = (raw) => {
    if (!raw) return '';
    return raw
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
      .replace(/[•📋📍⏰👤📊🟢👋🚨]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const speakText = (text, msgId = null) => {
    try {
      if (isSpeaking && speakingMsgId === msgId) {
        stopSpeaking();
        return;
      }
      Speech.stop();
      const clean = cleanTextForSpeech(text);
      if (!clean) return;

      setIsSpeaking(true);
      setSpeakingMsgId(msgId);

      Speech.speak(clean, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.96,
        onDone: () => { setIsSpeaking(false); setSpeakingMsgId(null); },
        onStopped: () => { setIsSpeaking(false); setSpeakingMsgId(null); },
        onError: () => { setIsSpeaking(false); setSpeakingMsgId(null); },
      });
    } catch (e) {
      setIsSpeaking(false);
      setSpeakingMsgId(null);
    }
  };

  const stopSpeaking = () => {
    try { Speech.stop(); } catch (e) {}
    setIsSpeaking(false);
    setSpeakingMsgId(null);
  };

  const handleSend = async (customText = null, isVoice = false) => {
    const textToSend = (customText || inputText || '').trim();
    if (!textToSend) return;

    const userMessage = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
      isVoice: isVoice
    };

    setMessages(prev => [...prev, userMessage]);
    if (!customText) setInputText('');
    setIsTyping(true);
    setIsVoiceListening(false);

    setTimeout(async () => {
      const responseText = await processBotResponse(textToSend.toLowerCase());
      const botMsgId = (Date.now() + 1).toString();
      const botMessage = { id: botMsgId, text: responseText, sender: 'bot' };

      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      if (voiceEnabled || isVoice) {
        speakText(responseText, botMsgId);
      }
    }, 800);
  };

  const processBotResponse = async (text) => {
    try {
      let employee = null;
      try {
        const allEmpSnap = await getDocs(collection(db, 'employees'));
        if (allEmpSnap && !allEmpSnap.empty) {
          const emailPrefix = (email || '').split('@')[0].toLowerCase();
          const authUid = (auth.currentUser?.uid || '').toLowerCase();
          const match = allEmpSnap.docs.find(d => {
            const data = d.data();
            const em = (data.email || '').trim().toLowerCase();
            const en = (data.name || '').trim().toLowerCase();
            const dUid = (data.uid || d.id || '').toLowerCase();
            return (
              (email && em === email.toLowerCase()) ||
              (emailPrefix && em.startsWith(emailPrefix)) ||
              (propUser?.name && en === propUser.name.toLowerCase()) ||
              (auth.currentUser?.displayName && en === auth.currentUser.displayName.toLowerCase()) ||
              (authUid && (dUid === authUid || d.id.toLowerCase() === authUid))
            );
          });
          if (match) employee = { id: match.id, ...match.data() };
        }
      } catch (e) {}

      if (!employee) {
        if (email) {
          const qEmp = query(collection(db, 'employees'), where('email', '==', email));
          const empSnap = await getDocs(qEmp);
          if (!empSnap.empty) employee = { id: empSnap.docs[0].id, ...empSnap.docs[0].data() };
        }
      }
      if (!employee) {
        const allEmp = await getDocs(collection(db, 'employees'));
        if (allEmp.size === 1) employee = { id: allEmp.docs[0].id, ...allEmp.docs[0].data() };
      }
      if (!employee) return "I could not find your employee record in the system.";

      // Resolve assignment, worksite, shift, and today's attendance record
      const asgContext = await getChatbotAssignmentContext(employee, email, propUser);

      // Keyword 1: Anomaly / Geofence / Shift Overtime / Alert / Violation (Handled first to avoid collisions)
      if (
        text.includes('anomal') ||
        text.includes('alert') ||
        text.includes('violation') ||
        text.includes('geofence') ||
        text.includes('outside') ||
        text.includes('overtime') ||
        text.includes('flagged')
      ) {
        const genericWords = ['employee', 'user', 'guard', 'staff', 'admin', 'officer', 'field employee', 'security'];
        const myIds = [
          employee?.id,
          employee?.idNum,
          employee?.empId,
          employee?.employeeId,
          employee?.uid,
          propUser?.id,
          propUser?.uid,
          propUser?.empId,
          auth.currentUser?.uid,
        ].filter(x => x !== undefined && x !== null && String(x).trim() !== '' && String(x).trim() !== 'emp_fallback')
         .map(x => String(x).trim().toLowerCase());

        const myEmails = [
          email,
          employee?.email,
          employee?.workEmail,
          propUser?.email,
          auth.currentUser?.email,
        ].filter(Boolean).map(e => String(e).trim().toLowerCase());

        const myNames = [
          employee?.name,
          employee?.displayName,
          propUser?.name,
          auth.currentUser?.displayName,
        ].filter(Boolean).map(n => String(n).trim().toLowerCase())
         .filter(n => n.length >= 2 && !genericWords.includes(n));

        let userAnomalies = [];
        try {
          const isMatch = (item) => {
            const aIds = [item.employeeId, item.employee_id, item.empId, item.userId, item.uid]
              .filter(x => x !== undefined && x !== null && String(x).trim() !== '' && String(x).trim() !== 'emp_fallback')
              .map(x => String(x).trim().toLowerCase());
            const aEmails = [item.employeeEmail, item.email, item.empEmail, item.userEmail]
              .filter(Boolean).map(e => String(e).trim().toLowerCase());
            const aNames = [item.employeeName, item.empName, item.userName]
              .filter(Boolean).map(n => String(n).trim().toLowerCase());

            if (aIds.length > 0) {
              if (myIds.length > 0) return aIds.some(id => myIds.includes(id));
            }
            if (aEmails.length > 0) {
              if (myEmails.length > 0) return aEmails.some(e => myEmails.includes(e));
            }
            if (aIds.length === 0 && aEmails.length === 0 && myNames.length > 0 && aNames.length > 0) {
              return aNames.some(n => myNames.includes(n));
            }
            return false;
          };

          const [snapAi, snapLogs] = await Promise.all([
            getDocs(collection(db, 'ai_analysis')).catch(() => ({ docs: [] })),
            getDocs(collection(db, 'ActivityLogs')).catch(() => ({ docs: [] })),
          ]);

          snapAi.docs.forEach(d => {
            const data = d.data();
            if (isMatch(data)) {
              userAnomalies.push({ id: d.id, ...data, source: 'ai_analysis' });
            }
          });

          snapLogs.docs.forEach(d => {
            const data = d.data();
            const isAnomaly = data.type === 'Security Anomaly' || data.type === 'Anomaly' || data.status === 'Warning' || data.status === 'Error' || (data.action && (data.action.includes('Anomaly') || data.action.includes('Failed') || data.action.includes('Flagged')));
            if (isAnomaly && isMatch(data)) {
              userAnomalies.push({ id: d.id, ...data, source: 'ActivityLogs' });
            }
          });
        } catch (err) {
          console.warn('Error fetching anomalies:', err);
        }

        const activeUserAnoms = userAnomalies.filter(a => {
          const st = (a.status || '').toLowerCase();
          return st !== 'resolved' && st !== 'dismissed' && !a.employeeResponse;
        });

        if (activeUserAnoms.length === 0) {
          return "✅ All clear! You have no unresolved anomaly alerts. Your GPS telemetry, geofence perimeter standing, and shift hours are all in normal status.";
        }

        const count = activeUserAnoms.length;
        const latest = activeUserAnoms[0];
        const rawTitle = latest.title || latest.type || latest.action || 'Security Anomaly';
        const title = typeof personalizeAnomalyTitle === 'function' ? personalizeAnomalyTitle(rawTitle, myNames) : rawTitle;
        const rawDesc = latest.description || latest.details || latest.reason || 'Unusual telemetry variance flagged.';
        const desc = typeof personalizeAnomalyDescription === 'function' ? personalizeAnomalyDescription(rawDesc, myNames) : rawDesc;

        let explanation = `⚠️ Active Anomaly Alerts (${count} Requiring Response):\n\n• Latest: ${title}\n• Severity: ${latest.severity || 'Medium'}\n• Details: ${desc}\n\n`;

        const evType = String(latest.eventType || '').toUpperCase();
        const typeStr = String(latest.type || '').toLowerCase();

        if (evType === 'UNAUTHORIZED_LOCATION' || typeStr.includes('geofence') || typeStr.includes('outside')) {
          explanation += "💡 AI Explanation:\nYou were detected outside your assigned worksite geofence perimeter.\n\n🎯 Recommended Actions:\n1. Open 'Anomaly Alerts' from your Home screen to submit an explanation.\n2. Return within the site perimeter to clear the boundary flag.";
        } else if (evType === 'OVERTIME_SHIFT_EXCEEDED' || typeStr.includes('overtime')) {
          explanation += "💡 AI Explanation:\nYour scheduled shift end time has elapsed, but you are still clocked in.\n\n🎯 Recommended Actions:\n1. If your shift is completed, please proceed to the Attendance screen and tap 'Check Out Now'.\n2. If authorized for overtime, inform your supervisor to approve the extension.";
        } else {
          explanation += "💡 Recommended Actions:\nPlease open the 'Anomaly Alerts' screen on your Home dashboard to review your alerts and submit an explanation or photo proof.";
        }

        return explanation;
      }

      // Keyword 2: Assignment
      if (
        text.includes('assignment') ||
        text.includes('task') ||
        text.includes('work') ||
        /\b(ano|anong)\s+(ang\s+)?(assignment|task|work|shift)/i.test(text)
      ) {
        // If she is done checkout: do NOT respond with the current assignment
        if (asgContext.isCheckedOut) {
          return `You have already checked out and completed your shift for today${asgContext.checkOutTimeStr ? ` (Checked out at ${asgContext.checkOutTimeStr})` : ''}. You have no active ongoing assignments at this time.`;
        }

        // Only respond with current assignment if she is checked in
        if (asgContext.isCheckedIn) {
          return `Current Assignment:\n\nSite: ${asgContext.siteName}\nShift: ${asgContext.shift}\nDate: ${asgContext.dateStr}\nStatus: On Duty (Checked in at ${asgContext.checkInTimeStr})`;
        }

        // If not checked in yet
        if (asgContext.hasAssignment) {
          return `You are currently not checked in. You have a scheduled shift at ${asgContext.siteName} (${asgContext.shift}) for today. Please check in upon arrival at your assigned site.`;
        }

        return "You have no active assignments scheduled for today. Please contact your operations supervisor.";
      }

      // Keyword 3: Location / Site
      if (text.includes('site') || text.includes('nasaan') || text.includes('location') || text.includes('where')) {
        if (!asgContext.hasAssignment) {
          return "No active worksite assignment found. Please contact your operations supervisor.";
        }
        return `Assigned Site Location:\n\nName: ${asgContext.siteName}\nAddress: ${asgContext.address}\nShift: ${asgContext.shift}\nStatus: ${asgContext.statusText}`;
      }

      // Keyword 4: Attendance count
      if (text.includes('attendance') || text.includes('ilang') || text.includes('count')) {
        let attCount = 0;
        try {
          const q1 = await getDocs(collection(db, 'Attendance')).catch(() => null);
          const q2 = await getDocs(collection(db, 'attendance')).catch(() => null);
          const all = [...(q1?.docs || []), ...(q2?.docs || [])];
          const myName = (employee.name || '').toLowerCase();
          const myEmail = (email || '').toLowerCase();
          const seen = new Set();
          all.forEach(d => {
            const data = d.data();
            const aName = (data.employeeName || '').toLowerCase();
            const aMail = (data.email || '').toLowerCase();
            if ((myName && aName === myName) || (myEmail && aMail === myEmail)) {
              seen.add(d.id);
            }
          });
          attCount = seen.size;
        } catch (_) {}
        return `You have ${attCount} recorded attendance check-in(s) in total based on our records.`;
      }

      // Keyword 5: Time In / Check in
      if (text.includes('time') || text.includes('check in') || text.includes('oras') || text.includes('clock') || text.includes('in')) {
        if (asgContext.checkInTimeStr) {
          return `You checked in today at ${asgContext.checkInTimeStr}${asgContext.siteName ? ` at ${asgContext.siteName}` : ''}.${asgContext.checkOutTimeStr ? ` You checked out at ${asgContext.checkOutTimeStr}.` : ' Your status is currently On Duty.'}`;
        }
        return `You have not timed in today yet.${asgContext.hasAssignment ? ` Your scheduled site is ${asgContext.siteName} (${asgContext.shift}). Please verify your GPS location upon arrival.` : ''}`;
      }

      // Keyword 6: Status
      if (text.includes('status') || text.includes('duty') || text.includes('profile')) {
        const dutyStatus = asgContext.checkInTimeStr && !asgContext.checkOutTimeStr ? 'On Duty' : (employee.status || 'Active');
        return `Employee Profile:\n\nStatus: ${dutyStatus}\nAssignment Status: ${asgContext.statusText}\nSite: ${asgContext.siteName || 'Unassigned'}\nDepartment: ${employee.department || employee.org || 'Operations'}\nRole: ${employee.role || employee.type || 'Field Specialist'}`;
      }

      return "I can assist you with voice commands:\n\n• What is my assignment?\n• Where is my site location?\n• What time did I check in?\n• Show my attendance count\n• What is my status?\n• Check my anomaly alerts\n\nTap the microphone icon anytime to speak a command.";
    } catch (e) {
      console.error('Chatbot error in ChatbotScreen:', e);
      return "An error occurred while fetching your data.";
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.botIconWrap}>
            <Ionicons name="chatbubbles" size={20} color="#4F46E5" />
          </View>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              SubAi Voice & Chat
            </Text>
            <Text style={[styles.headerSubtitle, isSpeaking && { color: '#EEF2FF', fontWeight: '600' }]} numberOfLines={1} ellipsizeMode="tail">
              {isSpeaking ? '🔊 Speaking response...' : '🟢 Online · Voice Commands Enabled'}
            </Text>
          </View>
        </View>

        {/* Header Voice Toggle / Stop */}
        {isSpeaking ? (
          <TouchableOpacity
            onPress={stopSpeaking}
            style={styles.stopVoiceBtn}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="stop" size={13} color="#FFFFFF" />
            <Text style={styles.stopVoiceBtnText}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setVoiceEnabled(!voiceEnabled)}
            style={styles.headerVoiceBtn}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={voiceEnabled ? "volume-high" : "volume-mute"}
              size={20}
              color="white"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Voice Listening Overlay Panel */}
      {isVoiceListening && (
        <View style={styles.voicePanel}>
          <View style={styles.voicePanelHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.redDot} />
              <Text style={styles.voicePanelTitle}>Listening for Voice Command...</Text>
            </View>
            <TouchableOpacity onPress={() => setIsVoiceListening(false)}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.voicePulseContainer}>
            <Animated.View style={[styles.voicePulseRing, { transform: [{ scale: pulse }], opacity: pulseOpacity }]} />
            <View style={styles.voiceMicCenter}>
              <Ionicons name="mic" size={28} color="white" />
            </View>
          </View>

          <Text style={styles.voiceInstruction}>Tap a quick command or speak:</Text>

          <View style={styles.voiceChipsContainer}>
            {VOICE_COMMANDS.map(cmd => (
              <TouchableOpacity
                key={cmd.id}
                style={styles.voiceChip}
                onPress={() => handleSend(cmd.query, true)}
              >
                <Text style={styles.voiceChipText}>{cmd.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <ScrollView 
        style={styles.chatArea} 
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(msg => (
          <View key={msg.id} style={[styles.messageRow, msg.sender === 'user' ? styles.messageRowUser : styles.messageRowBot]}>
            {msg.sender === 'bot' && (
              <View style={styles.smallBotIcon}>
                <Ionicons name="chatbubbles" size={12} color="#fff" />
              </View>
            )}
            <View style={[styles.messageBubble, msg.sender === 'user' ? styles.userBubble : styles.botBubble]}>
              {msg.isVoice && (
                <View style={styles.voiceBadge}>
                  <Ionicons name="mic" size={11} color="#FFFFFF" />
                  <Text style={styles.voiceBadgeText}>Voice Command</Text>
                </View>
              )}
              <Text style={[styles.messageText, msg.sender === 'user' ? styles.userText : styles.botText]}>
                {msg.text}
              </Text>

              {/* Read Aloud Button */}
              {msg.sender === 'bot' && (
                <TouchableOpacity
                  onPress={() => speakText(msg.text, msg.id)}
                  style={styles.readAloudBtn}
                >
                  <Ionicons
                    name={isSpeaking && speakingMsgId === msg.id ? "stop-circle" : "volume-medium"}
                    size={14}
                    color={isSpeaking && speakingMsgId === msg.id ? "#DC2626" : "#4F46E5"}
                  />
                  <Text style={[styles.readAloudText, isSpeaking && speakingMsgId === msg.id && { color: "#DC2626" }]}>
                    {isSpeaking && speakingMsgId === msg.id ? "Stop" : "Read Aloud"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {isTyping && (
          <View style={[styles.messageRow, styles.messageRowBot]}>
            <View style={styles.smallBotIcon}>
              <Ionicons name="chatbubbles" size={12} color="#fff" />
            </View>
            <View style={[styles.messageBubble, styles.botBubble, { width: 60, alignItems: 'center' }]}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input Row */}
      <View style={[styles.inputArea, { paddingBottom: insets.bottom || 16 }]}>
        <TouchableOpacity
          style={[styles.micBtn, isVoiceListening && styles.micBtnActive]}
          onPress={() => setIsVoiceListening(!isVoiceListening)}
        >
          <Ionicons name={isVoiceListening ? "mic" : "mic-outline"} size={22} color={isVoiceListening ? "white" : "#4F46E5"} />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Ask me or tap mic for voice..."
          placeholderTextColor="#9CA3AF"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => handleSend()}
        />

        <TouchableOpacity style={styles.sendButton} onPress={() => handleSend()} disabled={!inputText.trim()}>
          <Ionicons name="send" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    backgroundColor: '#4F46E5',
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    zIndex: 10
  },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  botIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  headerTitle: { color: 'white', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#E0E7FF', fontSize: 11, marginTop: 1 },
  speakingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  headerVoiceBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  stopVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    flexShrink: 0,
  },
  stopVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  voicePanel: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    padding: 16, alignItems: 'center',
  },
  voicePanelHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  voicePanelTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  voicePulseContainer: { width: 70, height: 70, justifyContent: 'center', alignItems: 'center', marginVertical: 6 },
  voicePulseRing: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(79,70,229,0.3)' },
  voiceMicCenter: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
  voiceInstruction: { fontSize: 12, color: '#64748B', fontWeight: '500', marginBottom: 8 },
  voiceChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  voiceChip: {
    backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE',
  },
  voiceChipText: { fontSize: 11.5, color: '#4F46E5', fontWeight: '600' },

  chatArea: { flex: 1 },
  messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowBot: { justifyContent: 'flex-start' },
  smallBotIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  messageBubble: { maxWidth: '78%', padding: 13, borderRadius: 18 },
  userBubble: { backgroundColor: '#4F46E5', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: 'white', borderBottomLeftRadius: 4, elevation: 1 },
  voiceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 6,
  },
  voiceBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  readAloudBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9',
    alignSelf: 'flex-start',
  },
  readAloudText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },
  messageText: { fontSize: 14.5, lineHeight: 21 },
  userText: { color: 'white' },
  botText: { color: '#1F2937' },

  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#EEF2FF', borderWidth: 1.5, borderColor: '#C7D2FE',
    justifyContent: 'center', alignItems: 'center',
  },
  micBtnActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937'
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#4F46E5',
    justifyContent: 'center', alignItems: 'center',
  }
});
