import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { ChatMessage } from '../types/index.js';
import logo from './logo.png';
import beastOverlay from './beast.png';  // your beast image in src/

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [visitorId, setVisitorId] = useState<string>('');
  const [isVIP, setIsVIP] = useState<boolean | null>(null);
  const [, setIsLoading] = useState<boolean>(true);
  const [showBeast, setShowBeast] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // Initialize or persist visitor ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('visitorId');
    if (id) {
      setVisitorId(id);
    } else {
      const randomId = Math.random().toString(36).substring(7);
      setVisitorId(randomId);
      window.history.replaceState({}, '', `?visitorId=${randomId}`);
    }
  }, []);

  // Handle streaming LLM response
  const handleStreamingResponse = async (
    msgs: ChatMessage[],
    onChunk: (content: string) => void
  ) => {
    try {
      const requestId = Date.now();
      const response = await fetch('http://localhost:3001/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'chat',
          params: { messages: msgs, visitorId },
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      let currentContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          if (data.error) {
            throw new Error(data.error.message);
          }
          if (data.result) {
            if (data.result.done) {
              if (data.result.visitorData?.audiences) {
                setIsVIP(data.result.visitorData.audiences.includes('VIP'));
              }
              return;
            }
            if (data.result.content) {
              currentContent += data.result.content;
              onChunk(currentContent);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in streaming response:', error);
      throw error;
    }
  };

  // Fetch visitor data & initial assistant greeting
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!visitorId) return;
      try {
        const requestId = Date.now();
        const visitorResponse = await fetch('http://localhost:3001/visitor-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            method: 'fetch_visitor_data',
            params: { visitorId },
          }),
        });
        if (visitorResponse.ok) {
          const data = await visitorResponse.json();
          if (data.result?.audiences) {
            setIsVIP(data.result.audiences.includes('VIP'));
          }
        }
        await handleStreamingResponse([], (content) => {
          setMessages([{ role: 'assistant', content }]);
        });
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setIsVIP(false);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [visitorId]);

  // Log VIP status changes
  useEffect(() => {
    if (isVIP !== null) {
      console.log('VIP status changed to:', isVIP);
    }
  }, [isVIP]);

  // Show beast overlay only for non-VIP users
  useEffect(() => {
    if (!isVIP) {
      const timer = setTimeout(() => setShowBeast(true), 500);
      return () => clearTimeout(timer);
    } else {
      setShowBeast(false);
    }
  }, [isVIP]);

  // Send user message
  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage: ChatMessage = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    try {
      const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
      setMessages([...currentMessages, assistantMessage]);
      await handleStreamingResponse(currentMessages, (content) => {
        setMessages(prev => {
          const newMessages = [...prev];
          const last = newMessages[newMessages.length - 1];
          if (last.role === 'assistant') {
            last.content = content;
          }
          return newMessages;
        });
      });
    } catch (error) {
      console.error('Error communicating with server:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I couldn't connect to the server. Please try again." },
      ]);
    }
  };

  // Fetch deals for a category
  const handleCategoryClick = async (category: string) => {
    const userMessage: ChatMessage = { role: 'user', content: `Fetch deals for ${category}` };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    try {
      const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
      setMessages([...currentMessages, assistantMessage]);
      await handleStreamingResponse(currentMessages, (content) => {
        setMessages(prev => {
          const newMessages = [...prev];
          const last = newMessages[newMessages.length - 1];
          if (last.role === 'assistant') {
            last.content = content;
          }
          return newMessages;
        });
      });
    } catch (error) {
      console.error('Error fetching deals:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, I couldn't fetch deals for ${category}. Please try again.` },
      ]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-md p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <img src={logo} alt="RetailBot Logo" className="h-32" />
          <div className="text-gray-600 text-sm flex items-center">
            <span>Logged in:&nbsp;</span>
            <span className="font-semibold">{visitorId}</span>
            {isVIP && (
              <span className="ml-2 inline-block">
                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Category Menu */}
      <div className="bg-blue-500 p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-center space-x-4">
          {['Apparel', 'Electronics', 'Equipment', 'Footwear', 'Outdoor Gear'].map(category => (
            <button
              key={category}
              onClick={() => handleCategoryClick(category)}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full
                         hover:bg-blue-700 transition-all duration-300 transform hover:scale-105
                         flex items-center space-x-2 shadow-md"
            >
              <span>{category}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto max-w-4xl mx-auto w-full">
        {messages.map((msg, idx) => (
          <div key={idx} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span
              className={`inline-block p-2 rounded-lg ${
                msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 shadow-sm'
              }`}
              dangerouslySetInnerHTML={{ __html: msg.content }}
            />
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="bg-white border-t shadow-lg">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              className="flex-1 p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type your message..."
            />
            <button
              onClick={handleSend}
              className="p-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-700 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-blue-50 py-3 text-center">
        <span className="text-sm font-semibold text-blue-600">
          Powered by Tealium © 2025
        </span>
      </div>

      {/* Beast Overlay (bottom-right) for non-VIP users */}
      <img
        src={beastOverlay}
        alt="Promotional Beast"
        className={`beast-overlay${showBeast ? ' show' : ''}`}
      />
    </div>
  );
};

export default App;
