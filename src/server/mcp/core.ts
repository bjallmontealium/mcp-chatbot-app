// MCP implementation using JSON-RPC 2.0
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  execute: (args: any) => Promise<any>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// JSON-RPC 2.0 error codes
export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerError: -32000,
};

/**
 * MCP Server to register and execute tools using JSON-RPC 2.0
 */
export class MCPServer {
  private tools: Map<string, Tool> = new Map();
  public name: string;
  public description: string;

  constructor({ name, description }: { name: string; description: string }) {
    this.name = name;
    this.description = description;
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  private createErrorResponse(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    };
  }

  private createSuccessResponse(id: string | number | null, result: any): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      // Validate request
      if (request.jsonrpc !== '2.0') {
        return this.createErrorResponse(
          request.id,
          JsonRpcErrorCodes.InvalidRequest,
          'Invalid JSON-RPC version'
        );
      }

      const tool = this.tools.get(request.method);
      if (!tool) {
        return this.createErrorResponse(
          request.id,
          JsonRpcErrorCodes.MethodNotFound,
          `Method ${request.method} not found`
        );
      }

      // Execute tool
      try {
        const result = await tool.execute(request.params || {});
        return this.createSuccessResponse(request.id, result);
      } catch (error) {
        return this.createErrorResponse(
          request.id,
          JsonRpcErrorCodes.InternalError,
          'Error executing tool',
          error instanceof Error ? error.message : String(error)
        );
      }
    } catch (error) {
      return this.createErrorResponse(
        request.id,
        JsonRpcErrorCodes.InternalError,
        'Internal server error',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async handleBatch(requests: JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
    return Promise.all(requests.map(request => this.handleRequest(request)));
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }
}

/**
 * MCP Client to interact with multiple servers using JSON-RPC 2.0
 */
export class MCPClient {
  private servers: MCPServer[];
  private requestId: number = 0;

  constructor({ servers }: { servers: MCPServer[] }) {
    this.servers = servers;
  }

  private generateRequestId(): number {
    return ++this.requestId;
  }

  async listTools(): Promise<Tool[]> {
    return this.servers.flatMap((server) => server.listTools());
  }

  async callTool(name: string, args: any): Promise<any> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: name,
      params: args
    };

    for (const server of this.servers) {
      try {
        const response = await server.handleRequest(request);
        if (response.error) {
          continue; // Try next server if this one returns an error
        }
        return response.result;
      } catch (error) {
        continue; // Try next server if this one fails
      }
    }
    throw new Error(`Tool ${name} not found in any server`);
  }

  async callToolBatch(calls: Array<{ name: string; args: any }>): Promise<any[]> {
    const requests: JsonRpcRequest[] = calls.map(call => ({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: call.name,
      params: call.args
    }));

    for (const server of this.servers) {
      try {
        const responses = await server.handleBatch(requests);
        if (responses.some(response => response.error)) {
          continue; // Try next server if any response has an error
        }
        return responses.map(response => response.result);
      } catch (error) {
        continue; // Try next server if this one fails
      }
    }
    throw new Error('No server could handle the batch request');
  }
}
