# SEC Summariser 📊

<div align="center">
  <img src="public/image.png" alt="SEC Summariser Logo" width="200" />
</div>

> AI-powered SEC filing analysis platform with dual-tool workflow and intelligent document retrieval

![SEC Summariser](https://img.shields.io/badge/SEC-Summariser-blue?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15.4.5-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Database-green?style=for-the-badge&logo=supabase)
![Railway](https://img.shields.io/badge/Railway-Deployed-purple?style=for-the-badge&logo=railway)

## ✨ Core Capabilities

### 🧠 Intelligent AI Agent with Dual-Tool Workflow
- **Edy Specialist** - Dedicated AI agent trained for SEC filing analysis
- **Two-Tool System**: 
  - `researcher` - Fetches and stores SEC filings with metadata
  - `content_retriever` - Retrieves stored content for analysis
- **Smart Workflow Management** - AI automatically chooses when to fetch new vs. retrieve existing filings
- **Comprehensive System Prompt** - XML-structured instructions with few-shot examples

### 📊 Advanced SEC Filing Capabilities
- **Multi-Company Support** - CIK lookup by name or ticker (Apple, MSFT, Tesla, etc.)
- **Date Range Queries** - "Q3 2024", "in 2023", "latest 3 filings"
- **Form Type Support** - 10-K, 10-Q, 8-K, DEF 14A, and more
- **Intelligent Parsing** - HTML to structured Markdown with table preservation
- **Duplicate Prevention** - Automatic deduplication by user and accession number

### 💬 Production-Ready Chat Interface
- **Beautiful Tool Visualization** - Apple-simple UI for tool execution
- **Real-time Streaming** - Live AI responses with typing indicators
- **Enhanced URL Display** - Clean, actionable SEC filing links
- **Conversation Management** - Persistent sessions with auto-titling
- **User-Specific Data** - Complete isolation between users

### 🔒 Enterprise-Grade Security & Compliance
- **SEC Compliance** - User-specific User-Agent headers for all API calls
- **Row Level Security** - Database-level user isolation
- **Authenticated API Routes** - JWT-based protection
- **User Email Integration** - Automatic SEC.gov compliance with user identification
- **Data Persistence** - Secure storage of filings and chat history

## 🏗️ Tech Stack

### Frontend
- **Next.js 15.4.5** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **AI SDK** - Vercel's AI SDK for chat interface

### Backend & AI
- **Supabase** - Database, authentication, real-time subscriptions with RLS
- **PostgreSQL** - Multi-table schema: conversations, messages, reports, report_content
- **Gemini 2.5 Flash** - Google's LLM with 10-step tool execution limit
- **AI SDK v5** - Vercel's AI SDK with streamText, tool system, and UIMessageStreamResponse
- **SEC.gov API** - Official EDGAR database with user-compliant requests

### Data Processing & Storage
- **Custom SEC API Layer** - CIK lookup, date range parsing, content fetching
- **HTML to Markdown** - Cheerio + TurndownService with table preservation
- **Filing Content Storage** - Separate table for large document content
- **Tool Call Metadata** - JSONB storage of AI tool execution history

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- Google AI API key

### 1. Clone Repository
```bash
git clone https://github.com/Ayushbh6/SEC-Summariser.git
cd SEC-Summariser/sec-sumariser
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_key
```

### 4. Database Setup
Set up your Supabase database with the required tables and RLS policies. Contact the development team for the database schema.

### 5. Run Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` to start using SEC Summariser!

## 🎯 AI Agent Usage Examples

### Two-Tool Workflow in Action
```
User: "Get me Apple's latest 8-K filing"
🔍 researcher tool → Fetches from SEC, stores in database
📄 content_retriever tool → Gets content for analysis
🤖 AI Response → Structured analysis of the filing
```

### Natural Language Queries
```
"Get me the latest 10-K for Apple"
"Show me Tesla's last 3 quarterly reports" 
"Find Microsoft's 8-K filings from Q2 2024"
"Analyze Apple's revenue growth from their latest 10-Q"
"What are the key risk factors in Tesla's most recent filing?"
```

### Date Range Intelligence
```
"Get Apple 10-K reports for 2023" → startDate: '2023-01-01', endDate: '2023-12-31'
"Find Q3 2024 filings" → startDate: '2024-07-01', endDate: '2024-09-30'
"Latest 5 filings" → limit: 5 (no date range)
```

## 🗄️ Production Database Schema

### Core Tables
- **`conversations`** - Chat sessions with user isolation
- **`messages`** - Chat messages with metadata (JSONB for tool calls)
- **`reports`** - SEC filing metadata with user_id and message_id links
- **`report_content`** - Large filing content stored separately
- **`auth.users`** - Supabase authentication with email compliance

### Key Relationships
```sql
conversations.user_id → auth.users.id
messages.conversation_id → conversations.id
reports.user_id → auth.users.id
reports.message_id → messages.id (links to assistant message that triggered fetch)
report_content.report_id → reports.id
```

### Security & Compliance
- **Row Level Security (RLS)** on all tables
- **User email integration** - `reports` table uses authenticated user's email for SEC compliance
- **Duplicate prevention** - Unique constraint on user_id + filing_accession_number
- **Tool call tracking** - messages.metadata stores complete tool execution history

## 🔧 API Integration

### SEC Filing Types Supported
- **10-K** - Annual reports
- **10-Q** - Quarterly reports
- **8-K** - Current event reports
- **DEF 14A** - Proxy statements
- And more...

### Rate Limiting
- Compliant with SEC.gov rate limits
- Custom User-Agent as required
- Efficient caching and filtering

## 🛡️ Security Features

### Authentication
- Email/password registration
- Secure session management
- Password strength requirements
- Optional MFA support

### Data Protection
- Row Level Security (RLS)
- API key encryption
- Secure HTTP headers
- Input validation and sanitization

## 📱 Responsive Design

### Desktop
- Full sidebar with conversation history
- Multi-column layout
- Keyboard shortcuts support

### Mobile
- Collapsible sidebar
- Touch-optimized interface
- Swipe gestures

## 🚀 Deployment

### Railway (Production)
```bash
# Already configured with railway.toml
git push origin main
# Railway auto-deploys from GitHub
```

### Environment Variables Required
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key  
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_key
```

### Build Configuration
- **Node.js 18+** compatibility with polyfills
- **File API polyfill** for server-side AI SDK compatibility
- **Custom webpack config** for proper bundling
- **Production optimizations** enabled

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Code Style
- ESLint configuration included
- Prettier for code formatting
- TypeScript strict mode
- Conventional commit messages

## 📊 Performance

### Metrics
- **First Contentful Paint**: <1.5s
- **Time to Interactive**: <3s
- **Lighthouse Score**: 95+
- **Core Web Vitals**: Excellent

### Optimizations
- Next.js App Router
- Dynamic imports
- Image optimization
- Bundle splitting

## 🔍 SEO & Accessibility

- Semantic HTML structure
- ARIA labels and roles
- Keyboard navigation support
- Screen reader compatible
- Meta tags optimization

## 📈 Monitoring

### Error Tracking
- Console error logging
- User feedback collection
- Performance monitoring

### Analytics
- User interaction tracking
- Conversation metrics
- API usage statistics

## 🛠️ Development Scripts

```bash
npm run dev          # Start development server
npm run build        # Build production bundle
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript compilation check
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **SEC.gov** - Official filing data source
- **Supabase** - Backend infrastructure
- **Vercel** - AI SDK and deployment platform
- **Google AI** - Gemini language model

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Ayushbh6/SEC-Summariser/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Ayushbh6/SEC-Summariser/discussions)
---

<div align="center">

**Built with ❤️ by [Ayush Bhattacharya](https://github.com/Ayushbh6)**

</div>