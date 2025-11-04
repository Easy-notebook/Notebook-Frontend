# EasyRemote Notebook

A powerful, modern notebook application built with React, TypeScript, and Tauri. This application combines the flexibility of Jupyter-style notebooks with enhanced features for code execution, markdown editing, and workflow management.

## 🚀 Features

### Core Features
- **📝 Rich Text Editing**: TipTap-based markdown editor with mathematics support (KaTeX), tables, and more
- **💻 Code Execution**: Execute Python code cells with real-time output display
- **🔄 Multiple Cell Types**: Code, Markdown, Hybrid, Image, Link, and AI Thinking cells
- **📊 Data Visualization**: Support for charts, diagrams (Mermaid), and rich media
- **💾 Persistent Storage**: IndexedDB-based storage with file management
- **🌐 i18n Support**: Multi-language support (English & Chinese)
- **🎨 Theming**: Customizable themes with Ant Design and Tailwind CSS
- **⚡ Hot Module Replacement**: Fast development with Vite

### Advanced Features
- **🔀 Workflow Management**: Visual workflow builder and execution engine
- **🤖 AI Integration**: AI-powered features and planning context
- **📤 Export Options**: Export to JSON, DOCX, PDF, and Markdown
- **📥 Import Support**: Import from various file formats
- **🔍 Search & Filter**: Powerful search across notebooks
- **📁 File Management**: Organize notebooks in a library structure
- **🎯 Keyboard Shortcuts**: Comprehensive keyboard navigation

## 🛠️ Technology Stack

### Frontend
- **React 18.3** - UI framework
- **TypeScript 5.8** - Type-safe development
- **Vite 6.0** - Build tool and dev server
- **Tauri 2.2** - Desktop application wrapper
- **Zustand 5.0** - State management
- **Ant Design 5.27** - UI component library
- **Tailwind CSS 3.4** - Utility-first CSS
- **TipTap 2.x** - Rich text editor
- **CodeMirror 4.x** - Code editor
- **React Router 7.x** - Routing

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Vitest** - Unit testing
- **Husky** - Git hooks
- **lint-staged** - Pre-commit linting

## 📦 Installation

### Prerequisites
- Node.js >= 18.x
- npm >= 8.x
- Rust (for Tauri development)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/Notebook-Frontend.git
cd Notebook-Frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Run Tauri desktop app
npm run tauri dev
```

## 📜 Available Scripts

```bash
# Development
npm run dev          # Start Vite dev server
npm run tauri        # Run Tauri commands

# Building
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run format       # Format code with Prettier
npm run format:check # Check code formatting
npm run type-check   # Run TypeScript type checking

# Testing
npm run test         # Run tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Run tests with coverage
```

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── Editor/         # Editor-related components
│   │   ├── Cells/      # Cell types (Code, Markdown, etc.)
│   │   ├── TipTap/     # TipTap editor setup
│   │   └── ...
│   ├── Notebook/       # Main notebook interface
│   │   ├── hooks/      # Custom React hooks
│   │   ├── pages/      # Page components
│   │   ├── components/ # UI components
│   │   └── ...
│   ├── Scenario/       # Workflow and scenario components
│   └── UI/             # Shared UI components
├── store/              # Zustand state management
│   ├── notebookStore.ts
│   ├── codeStore.ts
│   └── ...
├── services/           # API and business logic
│   ├── notebookServices.ts
│   ├── streamHandler.ts
│   └── ...
├── storage/            # IndexedDB ORM layer
├── utils/              # Utility functions
│   ├── logger.ts      # Logging system
│   ├── export/        # Export utilities
│   └── ...
├── hooks/              # Shared React hooks
├── i18n/               # Internationalization
├── router/             # React Router configuration
├── theme/              # Theme configuration
├── types/              # TypeScript type definitions
└── test/               # Test utilities

src-tauri/              # Tauri desktop wrapper
```

## 🎯 Path Aliases

The project uses TypeScript path aliases for cleaner imports:

```typescript
@/           → ./src/
@Editor/     → ./src/components/Editor/
@Notebook/   → ./src/components/Notebook/
@Store/      → ./src/store/
@Services/   → ./src/services/
@Utils/      → ./src/utils/
@Config/     → ./src/config/
@Types/      → ./src/types/
@Storage/    → ./src/storage/
@Hooks/      → ./src/hooks/
```

## 🔧 Configuration Files

- `.prettierrc` - Prettier configuration
- `.editorconfig` - Editor configuration
- `eslint.config.js` - ESLint configuration
- `tsconfig.json` - TypeScript configuration
- `vite.config.js` - Vite configuration
- `vitest.config.ts` - Vitest configuration
- `.lintstagedrc.json` - lint-staged configuration

## 🧪 Testing

The project uses Vitest for testing with React Testing Library:

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

Test files should be placed alongside source files with `.test.ts` or `.spec.ts` extension.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow the existing code style
- Run `npm run lint:fix` before committing
- Run `npm run format` to format code
- Ensure all tests pass with `npm test`
- Use conventional commit messages

### Pre-commit Hooks

The project uses Husky and lint-staged to automatically:
- Lint and fix code
- Format code with Prettier
- Run type checks

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [Tauri](https://tauri.app/)
- [Ant Design](https://ant.design/)
- [TipTap](https://tiptap.dev/)
- [CodeMirror](https://codemirror.net/)
- All other open-source libraries used in this project

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Built with ❤️ using React, TypeScript, and Tauri**
