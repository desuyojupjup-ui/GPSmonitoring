import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs } from '../firebase';

export default function ChatbotScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! I am your GeoStride Assistant. Ask me about your assignments, site locations, or attendance!', sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef();

  const email = auth.currentUser?.email;

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessage = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Simulate network delay
    setTimeout(async () => {
      const responseText = await processBotResponse(userMessage.text.toLowerCase());
      const botMessage = { id: (Date.now() + 1).toString(), text: responseText, sender: 'bot' };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const processBotResponse = async (text) => {
    try {
      // 1. Fetch employee to know who is asking
      const qEmp = query(collection(db, 'employees'), where('email', '==', email));
      const empSnap = await getDocs(qEmp);
      if (empSnap.empty) return "I couldn't find your employee record.";
      const employee = empSnap.docs[0].data();

      // Keyword: Assignment / "assignment"
      if (text.includes('assignment') || text.includes('ano ang')) {
        const qAssign = query(collection(db, 'Assignments'), where('empName', '==', employee.name), where('status', '==', 'Active'));
        const assignSnap = await getDocs(qAssign);
        if (assignSnap.empty) return "You don't have any active assignments today.";
        const assign = assignSnap.docs[0].data();
        return `You are currently assigned to ${assign.site}.\nSchedule: ${assign.shift}`;
      }

      // Keyword: Location / Site / "nasaan"
      if (text.includes('site') || text.includes('nasaan') || text.includes('location')) {
        const qAssign = query(collection(db, 'Assignments'), where('empName', '==', employee.name), where('status', '==', 'Active'));
        const assignSnap = await getDocs(qAssign);
        if (assignSnap.empty) return "You don't have an active assignment to track.";
        const assign = assignSnap.docs[0].data();
        
        const qSite = query(collection(db, 'Sites'), where('name', '==', assign.site));
        const siteSnap = await getDocs(qSite);
        if (siteSnap.empty) return `Your site is ${assign.site}, but I can't find its exact address in the database.`;
        const site = siteSnap.docs[0].data();
        return `Your assigned site is ${assign.site}.\nAddress: ${site.address || 'Unknown'}`;
      }

      // Keyword: Attendance / "ilang"
      if (text.includes('attendance') || text.includes('ilang')) {
        const qAtt = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const attSnap = await getDocs(qAtt);
        return `You have checked in ${attSnap.size} times in total based on our records.`;
      }

      // Keyword: Time In / "oras"
      if (text.includes('time in') || text.includes('oras') || text.includes('check in')) {
        const qAtt = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const attSnap = await getDocs(qAtt);
        if (attSnap.empty) return "You haven't timed in today.";
        
        // Find today's time in
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayRecord = attSnap.docs.map(d=>d.data()).find(data => {
          if (!data.date) return false;
          const dDate = data.date.toDate ? data.date.toDate() : new Date(data.date);
          return dDate >= today;
        });

        if (todayRecord && todayRecord.timeIn) {
          const time = todayRecord.timeIn.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          return `You checked in today at ${time} at ${todayRecord.siteName}.`;
        } else {
          return "I can't find your time-in record for today.";
        }
      }

      return "I'm sorry, I didn't understand that. You can ask me about your 'assignment', 'site location', 'attendance', or 'time in'.";
    } catch (e) {
      console.error(e);
      return "An error occurred while fetching your data.";
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.botIconWrap}>
            <Ionicons name="chatbubbles" size={20} color="#4F46E5" />
          </View>
          <Text style={styles.headerTitle}>AI Assistant</Text>
        </View>
      </View>

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
              <Text style={[styles.messageText, msg.sender === 'user' ? styles.userText : styles.botText]}>{msg.text}</Text>
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

      <View style={[styles.inputArea, { paddingBottom: insets.bottom || 16 }]}>
        <TextInput
          style={styles.input}
          placeholder="Type your message..."
          placeholderTextColor="#9CA3AF"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={!inputText.trim()}>
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
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10
  },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center' },
  botIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  chatArea: { flex: 1 },
  messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowBot: { justifyContent: 'flex-start' },
  smallBotIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  messageBubble: { maxWidth: '75%', padding: 14, borderRadius: 18 },
  userBubble: { backgroundColor: '#4F46E5', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: 'white', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: 'white' },
  botText: { color: '#1F2937' },
  inputArea: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB'
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginRight: 10,
    color: '#1F2937'
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3
  }
});
