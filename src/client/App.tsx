import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { ChatMessage } from '../types/index.js';
import logo from './logo.png';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [visitorId, setVisitorId] = useState<string>('');
  const [isVIP, setIsVIP] = useState<boolean | null>(null);
  const [setIsLoading] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleStreamingResponse = async (messages: ChatMessage[], onChunk: (content: string) => void) => {
    try {
      const requestId = Date.now();
      const response = await fetch('http://localhost:3001/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method: 'chat',
          params: {
            messages,
            visitorId
          }
        })
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
        console.log('Received raw chunk:', chunk);
        
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('Parsed chunk data:', data);
              
              if (data.error) {
                console.error('Error from server:', data.error);
                throw new Error(data.error.message);
              }
              
              if (data.result) {
                if (data.result.done) {
                  if (data.result.visitorData && data.result.visitorData.audiences) {
                    const isVIPUser = data.result.visitorData.audiences.includes('VIP');
                    console.log('Updated VIP status:', isVIPUser);
                    setIsVIP(isVIPUser);
                  }
                  return;
                }
                
                if (data.result.content) {
                  currentContent += data.result.content;
                  onChunk(currentContent);
                }
              }
            } catch (error) {
              console.error('Error parsing chunk:', error, 'Raw line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in streaming response:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      throw error;
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!visitorId) return;

      try {
        console.log('Fetching initial data for visitorId:', visitorId);
        
        const requestId = Date.now();
        const visitorResponse = await fetch('http://localhost:3001/visitor-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            method: 'fetch_visitor_data',
            params: { visitorId }
          })
        });

        if (visitorResponse.ok) {
          const data = await visitorResponse.json();
          if (data.error) {
            throw new Error(data.error.message);
          }
          if (data.result) {
            console.log('Received visitor data:', data.result);
            if (data.result.audiences) {
              const isVIPUser = data.result.audiences.includes('VIP');
              console.log('Setting VIP status to:', isVIPUser);
              setIsVIP(isVIPUser);
            }
          }
        }
        
        await handleStreamingResponse([], (content) => {
          setMessages([{
            role: 'assistant',
            content
          }]);
        });
      } catch (error) {
        console.error('Error fetching initial data:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
        }
        setIsVIP(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [visitorId]);

  useEffect(() => {
    if (isVIP !== null) {
      console.log('VIP status changed to:', isVIP);
    }
  }, [isVIP]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');

    try {
      const assistantMessage: ChatMessage = { 
        role: 'assistant', 
        content: '' 
      };
      setMessages([...currentMessages, assistantMessage]);
      
      console.log('Sending request to server with messages:', currentMessages);
      
      await handleStreamingResponse(currentMessages, (content) => {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content = content;
          }
          return newMessages;
        });
      });
    } catch (error) {
      console.error('Error communicating with server:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: "Sorry, I couldn't connect to the server. Please try again."
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleCategoryClick = async (category: string) => {
    const userMessage: ChatMessage = { role: 'user', content: `Fetch deals for ${category}` };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);

    try {
      const assistantMessage: ChatMessage = { 
        role: 'assistant', 
        content: '' 
      };
      setMessages([...currentMessages, assistantMessage]);
      
      await handleStreamingResponse(currentMessages, (content) => {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content = content;
          }
          return newMessages;
        });
      });
    } catch (error) {
      console.error('Error fetching deals:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry, I couldn't fetch deals for ${category}. Please try again.`
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="bg-white shadow-md p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <img src={logo} alt="RetailBot Logo" className="h-32" />
          <div className="text-gray-600 text-sm flex items-center">
            Logged in: <span className="font-semibold ml-1">{visitorId}</span>
            {isVIP === true && (
              <div className="ml-2">
                <svg 
                  className="w-6 h-6 text-yellow-500" 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="bg-blue-500 p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-center space-x-4">
          {['Apparel', 'Electronics', 'Equipment', 'Footwear', 'Outdoor Gear'].map((category) => (
            <button
              key={category}
              onClick={() => handleCategoryClick(category)}
              className="px-6 py-3 bg-blue-600 text-white font-semibold 
                         rounded-full hover:bg-blue-700 transition-all duration-300 
                         transform hover:scale-105 flex items-center space-x-2 shadow-md"
            >
              <span>{category}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto max-w-4xl mx-auto w-full">
        {messages.map((msg, index) => (
          <div key={index} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span
              className={`inline-block p-2 rounded-lg ${
                msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 shadow-sm'
              }`}
            >
              <div
                className={`inline-block p-2 rounded-lg ${
                  msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'
                }`}
                dangerouslySetInnerHTML={{ __html: msg.content }}
              />
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="bg-white border-t shadow-lg">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
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
      <div className="bg-blue-50 py-3 text-center">
        <span className="text-sm font-semibold text-blue-600">Powered by Tealium © 2025</span>
      </div>
    </div>
  );
};

export default App;