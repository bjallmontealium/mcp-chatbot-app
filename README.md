# Retail Chatbot

A modern retail chatbot application built with TypeScript, React, and OpenAI's GPT. This application provides personalized shopping experiences by integrating with Tealium Moments API for visitor data and using MCP (Model Context Protocol) for product information.

## Features

- Personalized shopping experience based on visitor data
- Real-time visitor data integration with Tealium Moments
- Product recommendations and deals
- VIP customer handling with exclusive offers
- Real-time chat interface with streaming responses
- Modern, responsive UI built with React and Tailwind CSS

## Architecture

The application is built using a microservices architecture with three main components:

1. **Client Application (React)**
   - Built with React and TypeScript
   - Modern UI using Tailwind CSS
   - Real-time chat interface with streaming responses
   - Handles visitor interactions and displays personalized content

2. **Server Application (Node.js)**
   - Built with Express.js and TypeScript
   - JSON-RPC 2.0 protocol for communication
   - MCP implementation with LLM tool integration
   - OpenAI GPT integration for natural language processing

3. **MCP Servers**
   - Products Server: Manages product and deal data
   - Moments API Server: Integrates with Tealium Moments API for visitor data
   - Central MCP Client: Coordinates between servers and chat processing

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
MOMENTS_API_ENDPOINT=your_moments_api_endpoint
PORT=3001
```

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with the required environment variables

3. Start the development server:
   ```bash
   npm start
   ```

4. The application will be available at `http://localhost:3002`

## Project Structure

```
src/                    # Source code root
├── client/             # React client application
│   ├── App.tsx         # Main application component
│   └── App.css         # Application styles
├── server/             # Server application
│   ├── index.ts        # Server entry point
│   ├── llm.ts          # OpenAI LLM and tool integration
│   └── mcp/            # MCP implementation
│       ├── core.ts     # MCP core implementation
│       ├── products.ts # Product Deals server
│       └── moments.ts  # Moments API server
```

## Development

The application uses TypeScript for type safety and modern development practices. The codebase is organized into clear modules for maintainability and scalability.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for GPT-4
- Tealium for Moments API
- Antropic for efficient tool integration inspiration with MCP
