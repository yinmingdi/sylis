# Sylis

![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/typescript-5.0+-blue?style=flat-square&logo=typescript)
![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react)
![NestJS](https://img.shields.io/badge/nestjs-11-e0234e?style=flat-square&logo=nestjs)
![Python](https://img.shields.io/badge/python-%3E%3D3.8-3776ab?style=flat-square&logo=python)

English | [简体中文](./README.md)

**Sylis** is an **AI-powered English learning platform** built on top of modern web technologies and speech recognition.

[Documentation](https://yinmingdi.github.io/sylis/) | [Quick Start](https://yinmingdi.github.io/sylis/guide/quick-start) | [Discussions](https://github.com/your-org/sylis/discussions)

## Features

- **Personalized Learning** - AI-driven recommendation system with dynamic content adjustment
- **Speech Assessment** - WeNet-based pronunciation evaluation and improvement suggestions
- **AI Conversations** - Real-time chat practice with multi-scenario role-playing
- **Dynamic Content** - Auto-generated reading materials based on vocabulary weaknesses
- **Modern UI** - Beautiful mobile-first design with Antd Mobile and theme switching
- **Offline Support** - Progressive web app with offline learning capabilities

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/sylis.git
cd sylis

# Install dependencies
pnpm install

# Setup environment (see configuration guide)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start all services
pnpm start
```

Visit http://localhost:5173 to see the app in action.

## Tech Stack

- **Frontend**: React 19, TypeScript, Antd Mobile, Zustand, Vite
- **Backend**: NestJS 11, Prisma, PostgreSQL, Redis
- **AI Services**: OpenAI API, WeNet (Speech), Python FastAPI
- **Infrastructure**: Docker, pnpm Workspaces, VitePress

## Documentation

To check out the full documentation, visit [yinmingdi.github.io/sylis](https://yinmingdi.github.io/sylis/).

## Contributing

Please read the [Contributing Guide](https://yinmingdi.github.io/sylis/guide/contribution) before making a pull request.

## License

[ISC](https://opensource.org/licenses/ISC)

Copyright (c) 2024-present, Sylis Team
