import { MCPServer, Tool } from './core.js';
import axios from 'axios';

export interface VisitorData {
  visitorId: string;
  audiences: string[];
  badges: string[];
  metrics: number[];
}

/**
 * MCP server for accessing real-time visitor data from Tealium Moments API
 */
const momentsServer = new MCPServer({
  name: 'moments',
  description: 'Access real-time visitor data from Tealium Moments API',
});

// Tool to fetch visitor data
const fetchVisitorDataTool: Tool = {
  name: 'fetch_visitor_data',
  description: 'Retrieve visitor data including audience and badges',
  parameters: {
    type: 'object',
    properties: {
      visitorId: { type: 'string', description: 'Visitor ID' },
    },
    required: ['visitorId'],
  },
  execute: async ({ visitorId }) => {
    try {
      const response = await axios.get(
        `${process.env.MOMENTS_API_ENDPOINT}/?attributeId=5447&attributeValue=${visitorId}`,
        {
          headers: {
            'X-Engine-Id': process.env.MOMENTS_ENGINE_ID,
          },
        }
      );
      
      return {
        visitorId: String(visitorId),
        audiences: response.data.audiences,
        badges: response.data.badges,
        metrics: response.data.metrics,
      }
    } catch (error) {
      console.error("Error fetching visitor data:", error);
      return null;
    }
  },
};

momentsServer.registerTool(fetchVisitorDataTool);

export default momentsServer;
