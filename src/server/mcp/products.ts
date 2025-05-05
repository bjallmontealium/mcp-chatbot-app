import { MCPServer, Tool } from './core.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export interface ProductDeal {
  id: number;
  name: string;
  category: string;
  price: number;
  deal: string;
}

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MCP server for accessing product and deal data from a JSON file
 */
const productsServer = new MCPServer({
  name: 'products',
  description: 'Access product and deal information from a JSON file',
});

// Tool to fetch products
const fetchProductsTool: Tool = {
  name: 'fetch_products',
  description: 'Retrieve a list of product deal data',
  parameters: {
    type: 'object',
    properties: {
    },
  },
  execute: async ({ }) => {
    try {
      const filePath = path.join(__dirname, '../../../data/products.json');
      // console.log('Reading products from:', filePath);
      
      const data = await fs.readFile(filePath, 'utf-8');
      // console.log('Raw file data:', data);
      
      let products: ProductDeal[] = JSON.parse(data);
      console.log('Parsed products:', products);
      
      return { products };
    } catch (error) {
      console.error('Error fetching products:', error);
      return { error: 'Failed to fetch products' };
    }
  },
};

productsServer.registerTool(fetchProductsTool);

export default productsServer;
