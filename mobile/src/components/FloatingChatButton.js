import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  PanResponder,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, getCleanEmployeeEmail } from '../firebase';
import { getChatbotAssignmentContext } from '../utils/assignmentUtils';

const chatbotIcon = require('../../assets/chatbot.png');

// Module-level in-memory position reference preserved across screen navigation
let globalPanPosition = { x: 0, y: 0 };
const CHATBOT_POS_KEY = '@chatbot_position_v2';

const VOICE_COMMANDS = [
  { id: 'vc1', label: 'What is my assignment?', icon: 'clipboard-outline', query: 'What is my assignment?' },
  { id: 'vc2', label: 'Where is my site location?', icon: 'location-outline', query: 'Where is my site?' },
  { id: 'vc3', label: 'What time did I check in?', icon: 'time-outline', query: 'What time did I check in?' },
  { id: 'vc4', label: 'Show my attendance count', icon: 'stats-chart-outline', query: 'How many attendances?' },
  { id: 'vc5', label: 'What is my current status?', icon: 'person-outline', query: 'What is my status?' },
  { id: 'vc6', label: 'Report delay or roadblock', icon: 'warning-outline', query: 'How to report delay?' },
  { id: 'vc7', label: 'Do I have any anomalies?', icon: 'shield-alert-outline', query: 'Do I have any anomalies?' },
];

const QUICK_ACTIONS = [
  { id: 'qa1', label: 'Assignment', icon: 'clipboard-outline', query: 'What is my assignment?' },
  { id: 'qa2', label: 'My Site', icon: 'location-outline', query: 'Where is my site?' },
  { id: 'qa3', label: 'Time In', icon: 'time-outline', query: 'What time did I check in?' },
  { id: 'qa4', label: 'Attendance', icon: 'stats-chart-outline', query: 'How many attendances?' },
  { id: 'qa5', label: 'My Status', icon: 'person-outline', query: 'What is my status?' },
  { id: 'qa6', label: 'Anomalies', icon: 'shield-alert-outline', query: 'Do I have any anomalies?' },
];

export default function FloatingChatButton({ user: propUser }) {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "Hello! I am your SubAi Assistant. Ask me about your assignments, site locations, attendance, or tap the microphone for Voice Commands.",
      sender: 'bot'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);

  const scrollRef = useRef();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Radar Pulse Animation for Voice Listening
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.6)).current;
  const opacity2 = useRef(new Animated.Value(0.4)).current;

  // Draggable PanResponder state initialized with latest global position
  const pan = useRef(new Animated.ValueXY(globalPanPosition)).current;

  useEffect(() => {
    (async () => {
      try {
        const savedPos = await AsyncStorage.getItem(CHATBOT_POS_KEY);
        if (savedPos) {
          const parsed = JSON.parse(savedPos);
          if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            globalPanPosition = parsed;
            pan.setValue(parsed);
          } else {
            pan.setValue(globalPanPosition);
          }
        } else {
          pan.setValue(globalPanPosition);
        }
      } catch (e) {
        pan.setValue(globalPanPosition);
      }
    })();
  }, []);

  // Voice Listening Animation Loop
  useEffect(() => {
    let loopAnim = null;
    if (isVoiceListening) {
      pulse1.setValue(1);
      pulse2.setValue(1);
      opacity1.setValue(0.6);
      opacity2.setValue(0.4);

      loopAnim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulse1, { toValue: 2.2, duration: 1500, useNativeDriver: true }),
            Animated.timing(pulse1, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacity1, { toValue: 0, duration: 1500, useNativeDriver: true }),
            Animated.timing(opacity1, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(pulse2, { toValue: 2.4, duration: 1500, useNativeDriver: true }),
            Animated.timing(pulse2, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(opacity2, { toValue: 0, duration: 1500, useNativeDriver: true }),
            Animated.timing(opacity2, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      loopAnim.start();
    } else {
      pulse1.setValue(1);
      pulse2.setValue(1);
    }
    return () => {
      if (loopAnim) loopAnim.stop();
    };
  }, [isVoiceListening]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (e, gestureState) => {
        pan.flattenOffset();
        const newPos = { x: pan.x._value, y: pan.y._value };
        globalPanPosition = newPos;
        AsyncStorage.setItem(CHATBOT_POS_KEY, JSON.stringify(newPos)).catch(() => {});

        if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
          openModal();
        }
      },
    })
  ).current;

  const email = getCleanEmployeeEmail(propUser, auth.currentUser);

  // Subtle floating bounce animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 1400, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const openModal = () => {
    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeModal = () => {
    stopSpeaking();
    setIsVoiceListening(false);
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  // ─── Speech Synthesis Helpers ────────────────────────────────────────────────
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
        onDone: () => {
          setIsSpeaking(false);
          setSpeakingMsgId(null);
        },
        onStopped: () => {
          setIsSpeaking(false);
          setSpeakingMsgId(null);
        },
        onError: () => {
          setIsSpeaking(false);
          setSpeakingMsgId(null);
        },
      });
    } catch (e) {
      setIsSpeaking(false);
      setSpeakingMsgId(null);
    }
  };

  const stopSpeaking = () => {
    try {
      Speech.stop();
    } catch (e) {}
    setIsSpeaking(false);
    setSpeakingMsgId(null);
  };

  // ─── Send Message ────────────────────────────────────────────────────────────
  const handleSend = async (customText = null, isVoice = false) => {
    const textToSend = (customText || inputText || '').trim();
    if (!textToSend) return;

    const userMsg = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
      isVoice: isVoice
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInputText('');
    setIsTyping(true);
    setIsVoiceListening(false);

    setTimeout(async () => {
      const response = await processBotResponse(textToSend.toLowerCase());
      const botMsgId = (Date.now() + 1).toString();
      const botMsg = { id: botMsgId, text: response, sender: 'bot' };

      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      if (voiceEnabled || isVoice) {
        speakText(response, botMsgId);
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
        let userAnomalies = [];
        try {
          const myId = (employee?.id || employee?.idNum || employee?.empId || '').toLowerCase();
          const myName = (employee?.name || propUser?.name || auth.currentUser?.displayName || '').toLowerCase();
          const myEmail = (email || '').toLowerCase();

          const isMatch = (item) => {
            const aId = (item.employeeId || item.employee_id || item.empId || '').toLowerCase();
            const aName = (item.employeeName || item.name || '').toLowerCase();
            const aEmail = (item.employeeEmail || item.email || '').toLowerCase();
            return (
              (myId && aId && (aId === myId || aId.includes(myId))) ||
              (myName && aName && (aName === myName || aName.includes(myName) || myName.includes(aName))) ||
              (myEmail && aEmail && (aEmail === myEmail || aEmail.includes(myEmail)))
            );
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
        } catch (_) {}

        const activeUserAnoms = userAnomalies.filter(a => {
          const st = (a.status || '').toLowerCase();
          return st !== 'resolved' && st !== 'dismissed' && !a.employeeResponse;
        });

        if (activeUserAnoms.length === 0) {
          return "✅ All clear! You have no unresolved anomaly alerts. Your GPS telemetry, geofence perimeter standing, and shift hours are all in normal status.";
        }

        const count = activeUserAnoms.length;
        const latest = activeUserAnoms[0];
        const title = latest.title || latest.type || latest.action || 'Security Anomaly';
        const desc = latest.description || latest.details || latest.reason || 'Unusual telemetry variance flagged.';

        let explanation = `⚠️ Active Anomaly Alerts (${count} Requiring Response):\n\n• Latest: ${title}\n• Severity: ${latest.severity || 'Medium'}\n• Details: ${desc}\n\n`;

        if (latest.eventType === 'UNAUTHORIZED_LOCATION' || (latest.type || '').includes('Geofence')) {
          explanation += "💡 AI Explanation:\nYou were detected outside your assigned worksite geofence perimeter.\n\n🎯 Recommended Actions:\n1. Open 'Anomaly Alerts' from your Home screen to submit an explanation.\n2. Return within the site perimeter to clear the boundary flag.";
        } else if (latest.eventType === 'OVERTIME_SHIFT_EXCEEDED' || (latest.type || '').includes('Overtime')) {
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

      // Keyword 3: Site / Location
      if (text.includes('site') || text.includes('location') || text.includes('nasaan') || text.includes('where')) {
        if (!asgContext.hasAssignment) {
          return "No active worksite assignment found. Please contact your operations supervisor.";
        }
        return `Assigned Site Location:\n\nName: ${asgContext.siteName}\nAddress: ${asgContext.address}\nShift: ${asgContext.shift}\nStatus: ${asgContext.statusText}`;
      }

      // Keyword 4: Attendance count
      if (text.includes('attendance') || text.includes('ilang') || text.includes('count') || text.includes('record')) {
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
        return `You have ${attCount} recorded attendance check-in(s) in total.`;
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

      // Keyword 7: Delay / Report
      if (text.includes('delay') || text.includes('roadblock') || text.includes('traffic') || text.includes('incident') || text.includes('report')) {
        return "To report a delay or roadblock, tap the 'Report Incident / Delay' button on your Home screen to notify your supervisor.";
      }

      return "I can assist you with Voice Commands:\n\n• What is my assignment?\n• Where is my site location?\n• What time did I check in?\n• Show my attendance count\n• What is my status?\n• Do I have any anomalies?\n\nTap the microphone icon anytime to speak a command.";
    } catch (e) {
      return "An error occurred while fetching your data. Please try again.";
    }
  };

  return (
    <>
      {/* Draggable Floating Action Button (Anchored to bottom-right, not centered) */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.fab,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y }
            ]
          }
        ]}
      >
        <TouchableOpacity onPress={openModal} activeOpacity={0.85} style={styles.fabTouchable}>
          <Animated.View style={[styles.fabCircle, { transform: [{ translateY: bounceAnim }] }]}>
            <Image source={chatbotIcon} style={styles.fabImage} resizeMode="contain" />
            {/* Online Green Indicator Dot */}
            <View style={styles.fabOnlineDot} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Chat Modal */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.botIcon}>
              <Image source={chatbotIcon} style={{ width: 26, height: 26 }} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.headerTitle}>SubAi Voice & Chat Assistant</Text>
                {isSpeaking && (
                  <View style={styles.speakingBadge}>
                    <Ionicons name="volume-high" size={11} color="#4F46E5" />
                    <Text style={styles.speakingBadgeText}>Speaking</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <View style={styles.statusDot} />
                <Text style={styles.headerSub}>Online · Voice Commands Enabled</Text>
              </View>
            </View>

            {/* Voice Audio Toggle Button */}
            <TouchableOpacity 
              onPress={() => {
                if (isSpeaking) {
                  stopSpeaking();
                } else {
                  setVoiceEnabled(!voiceEnabled);
                }
              }} 
              style={[styles.headerActionBtn, isSpeaking && styles.headerActionBtnActive]}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isSpeaking ? "stop-circle" : (voiceEnabled ? "volume-high" : "volume-mute")} 
                size={18} 
                color={isSpeaking ? "#DC2626" : (voiceEnabled ? "#4F46E5" : "#9CA3AF")} 
              />
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Voice Command Listening Overlay Panel */}
          {isVoiceListening && (
            <View style={styles.voiceOverlay}>
              <View style={styles.voiceHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={styles.voicePulseDot} />
                  <Text style={styles.voiceStatusTitle}>Listening for Voice Command...</Text>
                </View>
                <TouchableOpacity onPress={() => setIsVoiceListening(false)} style={styles.voiceCloseBtn}>
                  <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Animated Radar Pulse Waves around Microphone Icon */}
              <View style={styles.voiceMicContainer}>
                <Animated.View
                  style={[
                    styles.voiceRadarRing,
                    { transform: [{ scale: pulse1 }], opacity: opacity1 }
                  ]}
                />
                <Animated.View
                  style={[
                    styles.voiceRadarRing,
                    { transform: [{ scale: pulse2 }], opacity: opacity2 }
                  ]}
                />
                <View style={styles.voiceMicCircle}>
                  <Ionicons name="mic" size={30} color="#FFFFFF" />
                </View>
              </View>

              <Text style={styles.voicePromptText}>Say or tap a quick voice command:</Text>

              {/* Voice Command Quick Action Cards */}
              <View style={styles.voiceCommandGrid}>
                {VOICE_COMMANDS.map(cmd => (
                  <TouchableOpacity
                    key={cmd.id}
                    style={styles.voiceCommandCard}
                    onPress={() => handleSend(cmd.query, true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={cmd.icon} size={15} color="#4F46E5" />
                    <Text style={styles.voiceCommandCardText} numberOfLines={1}>
                      {cmd.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Messages Area */}
          <ScrollView
            ref={scrollRef}
            style={[styles.chatArea, isVoiceListening && { maxHeight: 150 }]}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map(msg => (
              <View key={msg.id} style={[styles.msgRow, msg.sender === 'user' ? styles.msgRowUser : styles.msgRowBot]}>
                {msg.sender === 'bot' && (
                  <View style={styles.smallBotIcon}>
                    <Image source={chatbotIcon} style={{ width: 16, height: 16 }} resizeMode="contain" />
                  </View>
                )}
                <View style={[styles.bubble, msg.sender === 'user' ? styles.userBubble : styles.botBubble]}>
                  {msg.isVoice && (
                    <View style={styles.voiceBadge}>
                      <Ionicons name="mic" size={11} color="#FFFFFF" />
                      <Text style={styles.voiceBadgeText}>Voice Command</Text>
                    </View>
                  )}
                  <Text style={[styles.bubbleText, msg.sender === 'user' ? { color: 'white' } : { color: '#1F2937' }]}>
                    {msg.text}
                  </Text>

                  {/* Real Icon Read Aloud Button for Bot Messages */}
                  {msg.sender === 'bot' && (
                    <TouchableOpacity
                      onPress={() => speakText(msg.text, msg.id)}
                      style={styles.speakerBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons 
                        name={isSpeaking && speakingMsgId === msg.id ? "stop-circle" : "volume-medium"} 
                        size={15} 
                        color={isSpeaking && speakingMsgId === msg.id ? "#DC2626" : "#4F46E5"} 
                      />
                      <Text style={[styles.speakerBtnText, isSpeaking && speakingMsgId === msg.id && { color: "#DC2626" }]}>
                        {isSpeaking && speakingMsgId === msg.id ? "Stop" : "Read Aloud"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            {isTyping && (
              <View style={[styles.msgRow, styles.msgRowBot]}>
                <View style={styles.smallBotIcon}>
                  <Image source={chatbotIcon} style={{ width: 16, height: 16 }} resizeMode="contain" />
                </View>
                <View style={[styles.bubble, styles.botBubble, { paddingVertical: 14, paddingHorizontal: 18 }]}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Quick Action Chips with Real Vector Icons */}
          {!isVoiceListening && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickReplies} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {QUICK_ACTIONS.map(q => (
                <TouchableOpacity key={q.id} style={styles.quickChip} onPress={() => { handleSend(q.query, false); }}>
                  <Ionicons name={q.icon} size={13} color="#4F46E5" style={{ marginRight: 4 }} />
                  <Text style={styles.quickChipText}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Input & Voice Bar */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.inputRow}>
              {/* Real Icon Voice Command Microphone Button */}
              <TouchableOpacity
                style={[styles.voiceMicBtn, isVoiceListening && styles.voiceMicBtnActive]}
                onPress={() => setIsVoiceListening(!isVoiceListening)}
                activeOpacity={0.8}
              >
                <Ionicons name={isVoiceListening ? "mic" : "mic-outline"} size={22} color={isVoiceListening ? "#FFFFFF" : "#4F46E5"} />
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder="Ask me or tap mic for voice..."
                placeholderTextColor="#9CA3AF"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => handleSend()}
              />

              <TouchableOpacity
                style={[styles.sendBtn, { opacity: inputText.trim() ? 1 : 0.4 }]}
                onPress={() => handleSend()}
                disabled={!inputText.trim()}
              >
                <Ionicons name="send" size={18} color="white" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 84, right: 20,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 999,
  },
  fabTouchable: {
    width: 60, height: 60,
    justifyContent: 'center', alignItems: 'center',
  },
  fabCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#4F46E5',
    borderWidth: 2, borderColor: '#818CF8',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  fabImage: {
    width: 44, height: 44,
  },
  fabOnlineDot: {
    position: 'absolute', top: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '82%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  botIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11, color: '#6B7280' },
  statusDot: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981',
  },
  speakingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  speakingBadgeText: { fontSize: 10, color: '#4F46E5', fontWeight: '600' },
  headerActionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
  },
  headerActionBtnActive: {
    backgroundColor: '#FEE2E2',
  },
  closeBtn: { padding: 4 },

  // Voice Listening Panel Overlay
  voiceOverlay: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
  },
  voiceHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginBottom: 12,
  },
  voicePulseDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 6,
  },
  voiceStatusTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  voiceCloseBtn: { padding: 4 },
  voiceMicContainer: {
    width: 76, height: 76, justifyContent: 'center', alignItems: 'center',
    marginVertical: 8,
  },
  voiceRadarRing: {
    position: 'absolute',
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(79, 70, 229, 0.25)',
  },
  voiceMicCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#4F46E5',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  voicePromptText: {
    fontSize: 12, color: '#64748B', fontWeight: '500', marginBottom: 10,
  },
  voiceCommandGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
  },
  voiceCommandCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  voiceCommandCardText: { fontSize: 11.5, color: '#334155', fontWeight: '600' },

  // Messages Area
  chatArea: { maxHeight: 260 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  smallBotIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginRight: 6,
  },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: '#4F46E5', borderBottomRightRadius: 4 },
  botBubble: {
    backgroundColor: '#F3F4F6', borderBottomLeftRadius: 4,
  },
  voiceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 6,
  },
  voiceBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  speakerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E5E7EB',
    alignSelf: 'flex-start',
  },
  speakerBtnText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },

  quickReplies: { maxHeight: 44, marginVertical: 6 },
  quickChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EEF2FF', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  quickChipText: { fontSize: 12, color: '#4F46E5', fontWeight: '600' },

  // Input Row
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 8,
  },
  voiceMicBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#EEF2FF', borderWidth: 1.5, borderColor: '#C7D2FE',
    justifyContent: 'center', alignItems: 'center',
  },
  voiceMicBtnActive: {
    backgroundColor: '#EF4444', borderColor: '#EF4444',
  },
  input: {
    flex: 1, backgroundColor: '#F3F4F6',
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 13.5, color: '#1F2937',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#4F46E5',
    justifyContent: 'center', alignItems: 'center',
  },
});
