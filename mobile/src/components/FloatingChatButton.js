import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, Animated, KeyboardAvoidingView,
  Platform, ActivityIndicator, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs } from '../firebase';

export default function FloatingChatButton() {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([
    { id: '1', text: "Hello! I'm your GeoStride Assistant 👋\n\nAsk me about your assignment, site location, attendance, or check-in time!", sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const email = auth.currentUser?.email;

  // Bounce animation for floating icon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 1200, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
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
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const userMsg = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(async () => {
      const response = await processBotResponse(inputText.toLowerCase());
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: response, sender: 'bot' }]);
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 1000);
  };

  const processBotResponse = async (text) => {
    try {
      const qEmp = query(collection(db, 'employees'), where('email', '==', email));
      const empSnap = await getDocs(qEmp);
      if (empSnap.empty) return "I couldn't find your employee record.";
      const employee = empSnap.docs[0].data();

      if (text.includes('assignment') || text.includes('ano') || text.includes('work')) {
        const qA = query(collection(db, 'Assignments'), where('empName', '==', employee.name), where('status', '==', 'Active'));
        const aSnap = await getDocs(qA);
        if (aSnap.empty) return "You don't have any active assignments today. 📋";
        const a = aSnap.docs[0].data();
        return `📋 You are assigned to:\n\n${a.site}\nShift: ${a.shift || 'N/A'}\nDate: ${a.assignDate || 'Today'}`;
      }

      if (text.includes('site') || text.includes('nasaan') || text.includes('location') || text.includes('where')) {
        const qA = query(collection(db, 'Assignments'), where('empName', '==', employee.name), where('status', '==', 'Active'));
        const aSnap = await getDocs(qA);
        if (aSnap.empty) return "No active assignment found. 📍";
        const a = aSnap.docs[0].data();
        const qS = query(collection(db, 'Sites'), where('name', '==', a.site));
        const sSnap = await getDocs(qS);
        if (sSnap.empty) return `Your site is ${a.site}. I couldn't find the exact address.`;
        const s = sSnap.docs[0].data();
        return `📍 Your assigned site:\n\n${a.site}\n${s.address || 'Address not available'}`;
      }

      if (text.includes('attendance') || text.includes('ilang') || text.includes('count')) {
        const qAtt = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const attSnap = await getDocs(qAtt);
        return `📊 You have ${attSnap.size} recorded attendance(s) in total.`;
      }

      if (text.includes('time') || text.includes('check in') || text.includes('oras') || text.includes('in')) {
        const qAtt = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const attSnap = await getDocs(qAtt);
        const today = new Date(); today.setHours(0,0,0,0);
        const todayRec = attSnap.docs.map(d => d.data()).find(d => {
          if (!d.date) return false;
          const dDate = d.date.toDate ? d.date.toDate() : new Date(d.date);
          return dDate >= today;
        });
        if (!todayRec?.timeIn) return "You haven't timed in today. ⏰";
        const t = todayRec.timeIn.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `⏰ You checked in today at ${t}${todayRec.siteName ? `\nSite: ${todayRec.siteName}` : ''}.`;
      }

      if (text.includes('status')) {
        return `👤 Status: ${employee.status || 'Offline'}\nDepartment: ${employee.org || 'N/A'}\nRole: ${employee.type || 'N/A'}`;
      }

      return "I can help you with:\n\n• 'What is my assignment?'\n• 'Nasaan ang site ko?'\n• 'How many attendances?'\n• 'Anong oras ako nag time-in?'\n• 'What is my status?'";
    } catch (e) {
      return "An error occurred while fetching your data. Please try again.";
    }
  };

  return (
    <>
      {/* Floating Button (Icon Only) */}
      <TouchableOpacity style={styles.fab} onPress={openModal} activeOpacity={0.7}>
        <Animated.Image 
          source={require('../../assets/chatbot.png')} 
          style={{ width: 65, height: 65, transform: [{ translateY: bounceAnim }] }} 
          resizeMode="contain" 
        />
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.botIcon}>
              <Image source={require('../../assets/chatbot.png')} style={{ width: 22, height: 22 }} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>AI Assistant</Text>
              <Text style={styles.headerSub}>🟢 Online · GeoStride</Text>
            </View>
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map(msg => (
              <View key={msg.id} style={[styles.msgRow, msg.sender === 'user' ? styles.msgRowUser : styles.msgRowBot]}>
                {msg.sender === 'bot' && (
                  <View style={styles.smallBotIcon}>
                    <Image source={require('../../assets/chatbot.png')} style={{ width: 14, height: 14 }} resizeMode="contain" />
                  </View>
                )}
                <View style={[styles.bubble, msg.sender === 'user' ? styles.userBubble : styles.botBubble]}>
                  <Text style={[styles.bubbleText, msg.sender === 'user' ? { color: 'white' } : { color: '#1F2937' }]}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))}
            {isTyping && (
              <View style={[styles.msgRow, styles.msgRowBot]}>
                <View style={styles.smallBotIcon}>
                  <Image source={require('../../assets/chatbot.png')} style={{ width: 14, height: 14 }} resizeMode="contain" />
                </View>
                <View style={[styles.bubble, styles.botBubble, { paddingVertical: 14, paddingHorizontal: 18 }]}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Quick Replies */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickReplies} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {['My assignment', 'My site', 'Time in', 'Attendance count', 'My status'].map(q => (
              <TouchableOpacity key={q} style={styles.quickChip} onPress={() => { setInputText(q); }}>
                <Text style={styles.quickChipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Input */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Ask me anything..."
                placeholderTextColor="#9CA3AF"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { opacity: inputText.trim() ? 1 : 0.4 }]}
                onPress={handleSend}
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
    position: 'absolute', bottom: 80, right: 20,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 999,
  },
  pulseRing: {
    position: 'absolute', width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(79,70,229,0.25)',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '75%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  botIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  closeBtn: { padding: 4 },
  chatArea: { maxHeight: 260 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  smallBotIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginRight: 6,
  },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: '#4F46E5', borderBottomRightRadius: 4 },
  botBubble: {
    backgroundColor: '#F3F4F6', borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  quickReplies: { maxHeight: 48, marginVertical: 8 },
  quickChip: {
    backgroundColor: '#EEF2FF', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  quickChipText: { fontSize: 12, color: '#4F46E5', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 10,
  },
  input: {
    flex: 1, backgroundColor: '#F3F4F6',
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: '#1F2937',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#4F46E5',
    justifyContent: 'center', alignItems: 'center',
  },
});
