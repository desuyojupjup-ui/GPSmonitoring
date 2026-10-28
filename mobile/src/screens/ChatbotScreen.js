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
      const qEmp = query(collection(db, 'employees'), where('email', '==', email));
      const empSnap = await getDocs(qEmp);
      if (empSnap.empty) return "I couldn't find your employee record.";
      const employee = empSnap.docs[0].data();

      // Keyword: Assignment
      if (text.includes('assignment') || text.includes('ano') || text.includes('work')) {
        let cleanDocs = [];
        try {
          const q1 = await getDocs(collection(db, 'Assignments'));
          const q2 = await getDocs(collection(db, 'assignments'));
          const all = [...(q1?.docs || []), ...(q2?.docs || [])].map(d => ({ id: d.id, ...d.data() }));
          cleanDocs = all.filter(a => {
            const eMail = (a.employeeEmail || a.empEmail || '').toLowerCase();
            const eName = (a.employeeName || a.empName || '').toLowerCase();
            return (eMail && eMail === email?.toLowerCase()) || (eName && eName === employee?.name?.toLowerCase());
          });
        } catch (e) {}

        const activeAsg = cleanDocs.find(a => (a.status || 'Active').toLowerCase() === 'active');
        if (!activeAsg) return "You have no active assignments scheduled for today.";
        return `Current Assignment:\n\nSite: ${activeAsg.site || activeAsg.siteName || 'Assigned Site'}\nShift: ${activeAsg.shift || activeAsg.shiftTime || '08:00 AM - 05:00 PM'}\nDate: ${activeAsg.assignDate || 'Today'}`;
      }

      // Keyword: Location / Site
      if (text.includes('site') || text.includes('nasaan') || text.includes('location') || text.includes('where')) {
        let cleanDocs = [];
        try {
          const q1 = await getDocs(collection(db, 'Assignments'));
          const q2 = await getDocs(collection(db, 'assignments'));
          const all = [...(q1?.docs || []), ...(q2?.docs || [])].map(d => ({ id: d.id, ...d.data() }));
          cleanDocs = all.filter(a => {
            const eMail = (a.employeeEmail || a.empEmail || '').toLowerCase();
            const eName = (a.employeeName || a.empName || '').toLowerCase();
            return (eMail && eMail === email?.toLowerCase()) || (eName && eName === employee?.name?.toLowerCase());
          });
        } catch (e) {}

        const activeAsg = cleanDocs.find(a => (a.status || 'Active').toLowerCase() === 'active');
        if (!activeAsg) return "No active assignment found. Please contact your operations supervisor.";
        
        const siteName = activeAsg.site || activeAsg.siteName || 'Assigned Site';
        const qSite = query(collection(db, 'Sites'), where('name', '==', siteName));
        const siteSnap = await getDocs(qSite);
        const siteData = !siteSnap.empty ? siteSnap.docs[0].data() : null;
        return `Assigned Site Location:\n\nName: ${siteName}\nAddress: ${activeAsg.siteAddress || activeAsg.address || siteData?.address || 'Cebu IT Park, Lahug, Cebu City'}`;
      }

      // Keyword: Attendance
      if (text.includes('attendance') || text.includes('ilang') || text.includes('count')) {
        const qAtt = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const attSnap = await getDocs(qAtt);
        return `You have checked in ${attSnap.size} times in total based on our records.`;
      }

      // Keyword: Time In
      if (text.includes('time') || text.includes('check in') || text.includes('oras') || text.includes('clock') || text.includes('in')) {
        const qAtt = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const attSnap = await getDocs(qAtt);
        const today = new Date(); today.setHours(0,0,0,0);
        const todayRecord = attSnap.docs.map(d=>d.data()).find(data => {
          const raw = data.date || data.timeIn;
          if (!raw) return false;
          const dDate = raw.toDate ? raw.toDate() : new Date(raw);
          return !isNaN(dDate.getTime()) && dDate >= today;
        });

        if (todayRecord && (todayRecord.timeIn || todayRecord.check_in)) {
          const rawTime = todayRecord.timeIn || todayRecord.check_in;
          const d = rawTime?.toDate ? rawTime.toDate() : new Date(rawTime);
          const time = (!isNaN(d.getTime())) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified';
          return `You checked in today at ${time}${todayRecord.siteName ? ` at ${todayRecord.siteName}` : ''}.`;
        } else {
          return "You have not timed in today yet.";
        }
      }

      // Keyword: Status
      if (text.includes('status') || text.includes('duty')) {
        return `Employee Status: ${employee.status || 'On Duty'}\nDepartment: ${employee.org || 'Technical'}\nRole: ${employee.type || 'Field Specialist'}`;
      }

      // Keyword: Anomaly / Geofence / Shift Overtime / Alert / Violation
      if (
        text.includes('anomaly') ||
        text.includes('alert') ||
        text.includes('violation') ||
        text.includes('geofence') ||
        text.includes('outside') ||
        text.includes('overtime') ||
        text.includes('shift') ||
        text.includes('flagged')
      ) {
        let userAnomalies = [];
        try {
          const snap = await getDocs(collection(db, 'ai_analysis'));
          userAnomalies = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
              const aId = (a.employeeId || '').toLowerCase();
              const aName = (a.employeeName || '').toLowerCase();
              const aEmail = (a.employeeEmail || '').toLowerCase();
              const myId = (employee.id || '').toLowerCase();
              const myName = (employee.name || '').toLowerCase();
              const myEmail = (email || '').toLowerCase();
              return (
                (myId && aId === myId) ||
                (myName && (aName === myName || aName.includes(myName))) ||
                (myEmail && aEmail === myEmail)
              );
            });
        } catch (_) {}

        const activeUserAnoms = userAnomalies.filter(a => a.status !== 'Resolved' && a.status !== 'Dismissed');

        if (activeUserAnoms.length === 0) {
          return "All clear! You have no active anomaly alerts. Your GPS telemetry, geofence status, and shift schedule are in good standing.";
        }

        const latest = activeUserAnoms[0];
        let explanation = `Active Anomaly Alert:\n\nType: ${latest.type || 'Security Alert'}\nDetails: ${latest.description || 'Variance flagged'}\n\n`;

        if (latest.eventType === 'UNAUTHORIZED_LOCATION' || (latest.type || '').includes('Geofence')) {
          explanation += "Explanation: You were detected outside your assigned site geofence perimeter.\n\nRecommended Action: Tap Anomaly Alerts on your Home screen to submit an explanation or return within the site boundaries.";
        } else if (latest.eventType === 'OVERTIME_SHIFT_EXCEEDED' || (latest.type || '').includes('Overtime')) {
          explanation += "Explanation: Your scheduled shift has ended, but you are still clocked in.\n\nRecommended Action: Please proceed to the Attendance screen to Check Out, or notify your supervisor if authorized for overtime.";
        } else {
          explanation += "Recommended Action: Open Anomaly Alerts on your Home dashboard to review and submit an explanation.";
        }

        return explanation;
      }

      return "I can assist you with voice commands:\n\n• What is my assignment?\n• Where is my site location?\n• What time did I check in?\n• Show my attendance count\n• What is my status?\n• Check my anomaly alerts\n\nTap the microphone icon anytime to speak a command.";
    } catch (e) {
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
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.headerTitle}>SubAi Voice & Chat</Text>
              {isSpeaking && (
                <View style={styles.speakingChip}>
                  <Ionicons name="volume-high" size={11} color="#4F46E5" />
                  <Text style={styles.speakingChipText}>Speaking</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerSubtitle}>🟢 Online · Voice Commands Enabled</Text>
          </View>
        </View>

        {/* Header Voice Toggle */}
        <TouchableOpacity
          onPress={() => {
            if (isSpeaking) stopSpeaking();
            else setVoiceEnabled(!voiceEnabled);
          }}
          style={styles.headerVoiceBtn}
        >
          <Ionicons
            name={isSpeaking ? "stop-circle" : (voiceEnabled ? "volume-high" : "volume-mute")}
            size={20}
            color={isSpeaking ? "#EF4444" : "white"}
          />
        </TouchableOpacity>
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
  speakingChipText: { fontSize: 10, color: '#4F46E5', fontWeight: '700' },
  headerVoiceBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

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
