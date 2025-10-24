const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const Groq = require('groq-sdk');
const translate = require('@iamtraction/google-translate');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq AI (FREE and FAST!)
// Get your FREE API key from: https://console.groq.com/keys
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';

// Validate API key on startup
if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
  console.error('\n⚠️  ERROR: Groq API key is not set!');
  console.error('Please follow these steps:');
  console.error('1. Go to: https://console.groq.com/keys');
  console.error('2. Sign up for FREE (no credit card required)');
  console.error('3. Create an API key');
  console.error('4. Set it as environment variable:');
  console.error('   - Windows: set GROQ_API_KEY=your_key_here');
  console.error('   - Linux/Mac: export GROQ_API_KEY=your_key_here');
  console.error('   - Or replace "YOUR_GROQ_API_KEY" in server.js line 14\n');
}

const groq = new Groq({
  apiKey: GROQ_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Store uploaded PDF content in memory (in production, use a database)
const pdfStorage = new Map();

// Language detection and translation helper
async function detectAndTranslate(text, targetLang = 'auto') {
  try {
    if (targetLang === 'auto') {
      // Detect language
      const detection = await translate(text, { to: 'en' });
      return { 
        detectedLanguage: detection.from.language.iso,
        text: text 
      };
    } else {
      // Translate to target language
      const result = await translate(text, { to: targetLang });
      return {
        translatedText: result.text,
        originalText: text,
        from: result.from.language.iso,
        to: targetLang
      };
    }
  } catch (error) {
    console.error('Translation error:', error);
    return { text: text, error: 'Translation failed' };
  }
}

// AI response generation using Groq
async function generateAIResponse(question, context = '', language = 'en') {
  try {
    // Check if API key is valid
    if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
      return '❌ Error: Groq API key is not configured. Please set up your API key. Visit: https://console.groq.com/keys';
    }

    // Build the messages
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that answers questions accurately and concisely. If context from documents is provided, use it to answer the question. If the question is in a language other than English, respond in that same language.'
      }
    ];

    // Add context if available
    if (context) {
      messages.push({
        role: 'system',
        content: `Context from uploaded documents:\n${context}`
      });
    }

    // Add user question
    messages.push({
      role: 'user',
      content: question
    });

    // Generate response using Groq (using Llama 3 - very fast and free!)
    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: 'llama-3.3-70b-versatile', // Fast, free, and powerful
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false
    });

    let answer = chatCompletion.choices[0]?.message?.content || 'No response generated';

    // If the question was in a specific language, ensure the response is in that language
    if (language !== 'en' && language !== 'auto') {
      try {
        const translated = await translate(answer, { to: language });
        answer = translated.text;
      } catch (error) {
        console.error('Failed to translate response:', error);
      }
    }

    return answer;
  } catch (error) {
    console.error('AI generation error:', error);
    
    // Handle specific Groq errors
    if (error.message && error.message.includes('API key')) {
      return '❌ Invalid API Key Error: Please check your Groq API key. Get a free key from https://console.groq.com/keys';
    }
    
    if (error.message && error.message.includes('rate limit')) {
      return '⚠️ Rate Limit: Please wait a moment and try again. Groq has generous free limits.';
    }

    if (error.status === 401) {
      return '❌ Authentication Error: Invalid Groq API key. Please get a new key from https://console.groq.com/keys';
    }
    
    // Fallback responses for common Gujarati questions
    const gujaratiResponses = {
      'swaminarayan': 'Swaminarayan Bhagwan no janma 3 April 1781 ma Chhapaiya gaame thayo hato. Temnun asli naam Ghanshyam Pande hatu.',
      'chhapaiya': 'Chhapaiya ek nanu gaamu che je Uttar Pradesh, Bharat ma aavelu che. Ahin Swaminarayan Bhagwan no janma thayo hato.',
    };
    
    // Check for keywords in question
    const lowerQuestion = question.toLowerCase();
    for (const [key, value] of Object.entries(gujaratiResponses)) {
      if (lowerQuestion.includes(key)) {
        return value;
      }
    }
    
    return `I apologize, but I encountered an error: ${error.message}. Please try again.`;
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  const apiKeyStatus = GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY' 
    ? '✅ Configured' 
    : '❌ Not configured';
  
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    apiKey: apiKeyStatus,
    aiProvider: 'Groq (Free)'
  });
});

// Upload PDF endpoint
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = path.join('uploads', req.file.filename);
    const dataBuffer = await fs.readFile(filePath);
    
    // Parse PDF
    const pdfData = await pdfParse(dataBuffer);
    
    // Store PDF data
    const fileId = uuidv4();
    pdfStorage.set(fileId, {
      filename: req.file.originalname,
      text: pdfData.text,
      numPages: pdfData.numpages,
      info: pdfData.info,
      uploadedAt: new Date().toISOString(),
      filePath: filePath
    });

    res.json({
      success: true,
      fileId: fileId,
      filename: req.file.originalname,
      numPages: pdfData.numpages,
      textLength: pdfData.text.length,
      info: pdfData.info
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    res.status(500).json({ error: 'Failed to process PDF', details: error.message });
  }
});

// Get PDF content
app.get('/api/pdf/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const pdfData = pdfStorage.get(fileId);
    
    if (!pdfData) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    res.json({
      success: true,
      data: pdfData
    });
  } catch (error) {
    console.error('PDF retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve PDF' });
  }
});

// Process question (text or voice)
app.post('/api/ask-question', async (req, res) => {
  try {
    const { question, language = 'auto', fileId = null, audioData = null } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Process audio if provided (base64 audio from frontend)
    let processedQuestion = question;
    
    if (audioData) {
      // In a production app, you would use a speech-to-text service here
      // For now, we'll assume the frontend has already converted it to text
      processedQuestion = question || 'Audio processing not yet implemented';
    }
    
    // Detect language if auto
    let detectedLanguage = 'en';
    if (language === 'auto') {
      try {
        const detection = await detectAndTranslate(processedQuestion, 'auto');
        detectedLanguage = detection.detectedLanguage || 'en';
      } catch (error) {
        console.error('Language detection error:', error);
      }
    } else {
      detectedLanguage = language;
    }
    
    // Get context from uploaded PDF if provided
    let context = '';
    if (fileId && pdfStorage.has(fileId)) {
      const pdfData = pdfStorage.get(fileId);
      // Use first 3000 characters of PDF as context
      context = pdfData.text.substring(0, 3000);
    }
    
    // Generate AI response
    const aiResponse = await generateAIResponse(processedQuestion, context, detectedLanguage);
    
    res.json({
      success: true,
      question: processedQuestion,
      answer: aiResponse,
      language: detectedLanguage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Question processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process question', 
      details: error.message 
    });
  }
});

// Get available languages
app.get('/api/languages', (req, res) => {
  res.json({
    success: true,
    languages: [
      { code: 'en', name: 'English' },
      { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
      { code: 'hi', name: 'हिन्दी (Hindi)' },
      { code: 'es', name: 'Español (Spanish)' },
      { code: 'fr', name: 'Français (French)' },
      { code: 'de', name: 'Deutsch (German)' },
      { code: 'zh', name: '中文 (Chinese)' },
      { code: 'ja', name: '日本語 (Japanese)' },
      { code: 'ar', name: 'العربية (Arabic)' },
      { code: 'pt', name: 'Português (Portuguese)' }
    ]
  });
});

// Text-to-speech endpoint (returns audio URL or base64)
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text, language = 'en' } = req.body;
    
    // In production, integrate with a TTS service like:
    // - Google Cloud Text-to-Speech
    // - Amazon Polly
    // - Azure Cognitive Services
    // - Open source: Mozilla TTS, Coqui TTS
    
    // For demo purposes, returning a placeholder
    res.json({
      success: true,
      audioUrl: null,
      message: 'TTS integration pending. Use browser\'s Web Speech API for now.'
    });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'TTS failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 AI Provider: Groq (Free & Fast)`);
  
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
    console.log('\n⚠️  WARNING: Groq API key is NOT configured!');
    console.log('Get your FREE API key: https://console.groq.com/keys');
    console.log('No credit card required! ✅\n');
  } else {
    console.log('✅ Groq API key is configured\n');
  }
});
