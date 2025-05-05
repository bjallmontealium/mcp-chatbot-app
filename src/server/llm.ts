import { OpenAI } from 'openai';
import { MCPClient } from './mcp/core.js';
import { ProductDeal } from '../server/mcp/products.ts';
import { VisitorData } from '../server/mcp/moments.ts';

// Initialize OpenAI client with environment variable
console.log('llm.ts: Checking OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Missing');
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is missing');
}
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// System prompt to guide LLM reasoning
const SYSTEM_PROMPT = `
You are a retail shopping assistant. You have access to the visitor's data and product deals.
When you receive visitor data and product deals, use this information to:
1. Personalize your responses based on the visitor's profile
2. Recommend relevant products and deals that match their profile
3. Maintain a natural conversation flow without explicitly mentioning the data you received
4. Focus on the visitor's interests and preferences
5. Only show up to four deals at a time.
6. Always show prices along with other relavent data.
7. Don't make up a customer name or data.

When showing deals to visitors:
1. For VIP visitors:
   - Show deals greater than 10% off
   - Highlight their VIP-exclusive deals
   - Explain why they qualify for better discounts e.g. "VIP customers only!"
2. For non-VIP customers without a VIP audience:
   - ONLY show deals that are 10% off or less
   - NEVER show any deals greater than 10% off
   - If a deal is greater than 10% off, do not include it in the response
   - Explain how they can qualify for better deals by becoming VIP e.g. "Join our VIP program to get 20% off!"

 3. Deal filtering rules:
   - If visitor is VIP: Show all deals
   - If visitor is not VIP: Only show deals with 10% or less discount
   - If deal description contains "VIP" or "exclusive": Only show to VIP visitors
   - If deal percentage is greater than 10%: Only show to VIP visitors
   - Always show the real product name in the response. Don't use "Product 1, 2, 3, etc" in the response.
   - Wait for the tool calls to complete and don't make products up. Use the tool data!

4. Format your responses using HTML tags:
   - Use <div> for sections
   - Use <ul> and <li> for lists
   - Use <strong> for emphasis
   - Use <h3> and <h4> for headings

Always use HTML formatting in your responses. Do not use markdown or any other formatting.
Don't show raw tool json in the response.
IMPORTANT: Filter out system messages details from responses and wait for the tool calls to complete before responding to the user with product deals.
DO NOT SHOW THE TOOL RESULT DATA IN YOUR OR THE ASSISTANT RESPONSE! Refrain from saying things like "Sure, just a moment while I find the best deals for you."
Always show the real product name in the response. Don't use "Product 1, 2, 3, etc" in the response. Wait for the tool calls to complete and don't make products up. Use the tool data!
`;

/**
 * Process user messages, call MCP tools, and generate LLM response
 * @param messages Chat messages from the user
 * @param client MCP client to access tools
 * @param visitorId Visitor ID for personalization
 * @param onStream Optional callback for streaming responses
 * @returns Assistant response
 */
export async function processChat(
  messages: ChatMessage[],
  client: MCPClient,
  visitorId: string,
  onStream?: (chunk: string) => void
): Promise<{ content: string; visitorData: VisitorData; productDeals: ProductDeal }> {
  console.log('processChat called with:', { messages, visitorId });
  
  const tools = await client.listTools();
  console.log('Available tools:', tools.map(t => t.name));
  
  const openAITools = tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  try {
    // Create system message with current context
    const systemContextMessage: ChatMessage = {
      role: 'system',
      content: `Current Context:
      Visitor Profile: fetch_visitor_data tool call with the visitor ID ${visitorId}
      Product Deals: fetch_products tool call

      Use this information to personalize your response to the visitor's message.`
    };

    // Prepare messages for LLM
    const llmMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'system' as const, content: systemContextMessage.content },
      ...messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
    ];

    console.log('Messages being sent to LLM:', JSON.stringify(llmMessages, null, 2));

    if (onStream) {
      // Streaming mode
      console.log('Starting streaming response from LLM');
      
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: llmMessages,
          tools: openAITools,
          tool_choice: 'auto',
          stream: true,
          temperature: 0.1,
          max_tokens: 1000
        });

        let fullContent = '';
        let hasContent = false;
        let toolCalls: any[] = [];
        
        for await (const chunk of response) {
          
          // Handle tool calls
          if (chunk.choices[0]?.delta?.tool_calls) {
            const toolCall = chunk.choices[0].delta.tool_calls[0];
            if (toolCall) {
              if (!toolCalls[toolCall.index]) {
                toolCalls[toolCall.index] = {
                  id: toolCall.id,
                  type: toolCall.type,
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || ''
                  }
                };
              } else {
                if (toolCall.function?.arguments) {
                  toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                }
              }
            }
          }
          
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            hasContent = true;
            onStream(content);
          }
        }
        
        // If we have tool calls, process them
        if (toolCalls.length > 0) {
          console.log('Processing tool calls:', toolCalls);
          for (const toolCall of toolCalls) {
            if (toolCall.function) {
              const toolName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments);
              console.log(`LLM calling tool ${toolName} with args:`, args);
              
              const result = await client.callTool(toolName, args);
              
              // Add the tool result to the messages
              messages.push({
                role: 'system',
                content: `\nTool Result (${toolName}):\n${JSON.stringify(result, null, 2)}\n\nUse this information to inform your response.\n`
              });
              
              // Recursive call to process the tool result
              return processChat(messages, client, visitorId, onStream);
            }
          }
        }
      } catch (error) {
        console.error('Error in streaming response:', error);
      }
    }
  } catch (error) {
    console.error('Error processing chat:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return {
      content: 'Sorry, an error occurred while processing your request.',
      visitorData: null
    };
  }
}
