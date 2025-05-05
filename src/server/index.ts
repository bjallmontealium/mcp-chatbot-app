import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors'; 
import { MCPClient } from './mcp/core.js';
import path from 'path';
import fs from 'fs';
import productsServer from './mcp/products.js';
import momentsServer from './mcp/moments.js';
import { processChat } from './llm.js';

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Log startup
console.log('Server starting...');

// Log current working directory
console.log('Current working directory:', process.cwd());

// Construct and log .env file path
const envPath = path.resolve(process.cwd(), '.env');
console.log('Checking .env at:', envPath);

// Check if .env file exists
if (!fs.existsSync(envPath)) {
  console.error('.env file does not exist at:', envPath);
  process.exit(1);
}

// Log loaded environment variables (obscure sensitive values)
console.log('Environment variables:', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'Missing',
  MOMENTS_ENGINE_ID: process.env.MOMENTS_ENGINE_ID ? 'Set' : 'Missing',
  MOMENTS_API_ENDPOINT: process.env.MOMENTS_API_ENDPOINT ? 'Set' : 'Missing',
  PORT: process.env.PORT || 'Not set (defaulting to 3001)',
});

// Verify critical environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set in .env file');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: ['http://localhost:3002', 'http://127.0.0.1:3002'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`Middleware: Processing ${req.method} ${req.url}`);
  next();
});

app.use(express.json());

// Test endpoint for root
app.get('/', (req: Request, res: Response) => {
  console.log('Received GET / request');
  res.json({ message: 'Server is running!' });
});

// Endpoint to list available MCP tools
app.get('/tools/list', async (req: Request, res: Response) => {
  try {
    console.log('Received GET /tools/list request');
    
    const tools = await client.listTools();
    console.log('Available tools:', tools);
    
    res.json({
      jsonrpc: '2.0',
      id: null,
      result: {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }))
      }
    });
  } catch (error) {
    console.error('Error in /tools/list:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Failed to list tools',
        data: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// Endpoint to handle visitor data requests
app.post('/visitor-data', async (req: Request, res: Response) => {
  try {
    console.log('Received /visitor-data request with body:', req.body);
    
    // Validate JSON-RPC 2.0 request
    if (req.body.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC version'
        }
      });
    }

    const { visitorId } = req.body.params || {};
    
    if (!visitorId) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32602,
          message: 'Visitor ID is required'
        }
      });
    }
    
    console.log('Fetching visitor data for ID:', visitorId);
    const visitorData = await client.callTool('fetch_visitor_data', { visitorId });
    console.log('Manual MAPI fetch for first page personalization:\n', visitorData);
    
    res.json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      result: visitorData
    });
  } catch (error) {
    console.error('Error in /visitor-data:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32603,
        message: 'Failed to fetch visitor data',
        data: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// Endpoint to handle regular chat requests
app.post('/chat', async (req: Request, res: Response) => {
  console.log('Received POST /chat request:', req.body);
  
  // Validate JSON-RPC 2.0 request
  if (req.body.jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32600,
        message: 'Invalid JSON-RPC version'
      }
    });
  }

  const { messages, visitorId } = req.body.params || {};
  
  if (!messages || !visitorId) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32602,
        message: 'Messages and visitorId are required'
      }
    });
  }

  try {
    const response = await processChat(messages, client, visitorId);
    console.log('Sending response:', response);
    res.json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      result: response
    });
  } catch (error) {
    console.error('Error in /chat:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32603,
        message: 'Failed to process chat',
        data: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// Endpoint to handle streaming chat requests
app.post('/chat/stream', async (req: Request, res: Response) => {
  try {
    console.log('Received /chat/stream request with body:', req.body);
    
    // Validate JSON-RPC 2.0 request
    if (req.body.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC version'
        }
      });
    }

    const { messages, visitorId } = req.body.params || {};
    
    if (!messages || !visitorId) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32602,
          message: 'Messages and visitorId are required'
        }
      });
    }
    
    console.log('Parsed request data:', { messages, visitorId });
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
      console.log('Starting processChat with streaming');
      const response = await processChat(messages, client, visitorId, (chunk) => {
        // console.log('Sending chunk:', chunk);
        // Send each chunk as a server-sent event
        res.write(`data: ${JSON.stringify({
          jsonrpc: '2.0',
          id: req.body.id || null,
          result: { content: chunk }
        })}\n\n`);
      });
      
      console.log('Streaming complete, sending final response');
      // Send the final response with visitor data
      res.write(`data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: req.body.id || null,
        result: { done: true, visitorData: response }
      })}\n\n`);
      res.end();
    } catch (error) {
      console.error('Error in /chat/stream:', error);
      res.write(`data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32603,
          message: 'Failed to process chat',
          data: error instanceof Error ? error.message : String(error)
        }
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error parsing request data:', error);
    res.status(400).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32600,
        message: 'Invalid request data',
        data: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// Initialize MCP client with products and moments servers
console.log('Initializing MCP client...');
const client = new MCPClient({
  servers: [productsServer, momentsServer],
});

// Catch-all route for debugging
app.use((req: Request, res: Response) => {
  console.log(`Unhandled request: ${req.method} ${req.url}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);
console.log('Starting server on port:', PORT);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
