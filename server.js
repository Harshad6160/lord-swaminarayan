const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const axios = require('axios');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// GROQ API Configuration - Get free API key from https://console.groq.com/keys
const GROQ_API_KEY = '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';
const GROQ_API_URL =  'https://api.groq.com/openai/v1/chat/completions';

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Store PDF content
let pdfDatabase = [];

// Load existing PDFs on startup
async function loadExistingPDFs() {
  const uploadsDir = 'uploads';
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file.endsWith('.pdf')) {
        try {
          const filePath = path.join(uploadsDir, file);
          const text = await extractTextFromPDF(filePath);
          pdfDatabase.push({
            id: Date.now().toString() + Math.random(),
            filename: file,
            originalName: file.replace(/^\d+-/, ''),
            path: filePath,
            text: text,
            uploadDate: fs.statSync(filePath).birthtime
          });
        } catch (error) {
          console.error(`Error loading ${file}:`, error);
        }
      }
    }
    console.log(`📚 Loaded ${pdfDatabase.length} existing PDFs`);
  }
}

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '';
  }
}

// Call Groq API
async function callGroqAPI(prompt) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.1-8b-instant", // Free model
        messages: [
          {
            role: "system",
            content: "You are a knowledgeable and respectful assistant about Lord Swaminarayan. Keep answers concise (2-3 sentences maximum)."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Groq API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Serve web upload interface
app.get('/upload', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Swaminarayan PDF Upload</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: #FFF5E6;
        }
        h1 {
          color: #FF6B35;
        }
        .upload-area {
          border: 2px dashed #FF6B35;
          border-radius: 10px;
          padding: 30px;
          text-align: center;
          background: white;
          margin: 20px 0;
        }
        input[type="file"] {
          display: none;
        }
        .upload-btn {
          background: #FF6B35;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        .upload-btn:hover {
          background: #E55A2B;
        }
        .pdf-list {
          background: white;
          border-radius: 10px;
          padding: 20px;
          margin-top: 20px;
        }
        .pdf-item {
          padding: 10px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .delete-btn {
          background: #f44336;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 3px;
          cursor: pointer;
        }
        .status {
          padding: 10px;
          margin: 10px 0;
          border-radius: 5px;
          display: none;
        }
        .success {
          background: #4CAF50;
          color: white;
        }
        .error {
          background: #f44336;
          color: white;
        }
        .info-box {
          background: #E3F2FD;
          border: 1px solid #2196F3;
          border-radius: 5px;
          padding: 15px;
          margin: 20px 0;
        }
        .info-box h3 {
          margin-top: 0;
          color: #1976D2;
        }
      </style>
    </head>
    <body>
      <h1>📚 Swaminarayan PDF Library</h1>
      
      <div class="info-box">
        <h3>🤖 Using Groq AI (Free & Fast)</h3>
        <p>This demo uses Groq's free AI API with Llama 3 model for intelligent responses.</p>
        <p>To activate: Get a free API key from <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a> and update server.js</p>
      </div>
      
      <div class="upload-area">
        <h2>Upload PDF Files</h2>
        <p>Select PDFs about Lord Swaminarayan</p>
        <input type="file" id="fileInput" accept=".pdf" multiple>
        <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
          Choose PDFs
        </button>
      </div>
      
      <div id="status" class="status"></div>
      
      <div class="pdf-list">
        <h2>Uploaded PDFs</h2>
        <div id="pdfList">Loading...</div>
      </div>
      
      <script>
        async function loadPDFs() {
          try {
            const response = await fetch('/api/pdfs');
            const pdfs = await response.json();
            const listEl = document.getElementById('pdfList');
            
            if (pdfs.length === 0) {
              listEl.innerHTML = '<p>No PDFs uploaded yet</p>';
            } else {
              listEl.innerHTML = pdfs.map(pdf => \`
                <div class="pdf-item">
                  <span>📄 \${pdf.filename}</span>
                  <button class="delete-btn" onclick="deletePDF('\${pdf.id}')">Delete</button>
                </div>
              \`).join('');
            }
          } catch (error) {
            console.error('Error loading PDFs:', error);
          }
        }
        
        async function deletePDF(id) {
          if (!confirm('Delete this PDF?')) return;
          
          try {
            await fetch(\`/api/pdfs/\${id}\`, { method: 'DELETE' });
            showStatus('PDF deleted successfully', 'success');
            loadPDFs();
          } catch (error) {
            showStatus('Error deleting PDF', 'error');
          }
        }
        
        function showStatus(message, type) {
          const status = document.getElementById('status');
          status.textContent = message;
          status.className = 'status ' + type;
          status.style.display = 'block';
          setTimeout(() => {
            status.style.display = 'none';
          }, 3000);
        }
        
        document.getElementById('fileInput').addEventListener('change', async (e) => {
          const files = e.target.files;
          
          for (let file of files) {
            const formData = new FormData();
            formData.append('pdf', file);
            
            try {
              const response = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData
              });
              
              if (response.ok) {
                showStatus(\`Uploaded \${file.name} successfully\`, 'success');
              } else {
                showStatus(\`Error uploading \${file.name}\`, 'error');
              }
            } catch (error) {
              showStatus(\`Error uploading \${file.name}\`, 'error');
            }
          }
          
          e.target.value = '';
          setTimeout(loadPDFs, 500);
        });
        
        loadPDFs();
        setInterval(loadPDFs, 5000);
      </script>
    </body>
    </html>
  `);
});

// Upload PDF
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const filePath = req.file.path;
    const text = await extractTextFromPDF(filePath);

    const pdfData = {
      id: Date.now().toString(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: filePath,
      text: text,
      uploadDate: new Date()
    };

    pdfDatabase.push(pdfData);

    res.json({
      success: true,
      message: 'PDF uploaded and processed successfully',
      pdf: {
        id: pdfData.id,
        filename: pdfData.originalName,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('Error uploading PDF:', error);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

// Get all PDFs
app.get('/api/pdfs', (req, res) => {
  const pdfList = pdfDatabase.map(pdf => ({
    id: pdf.id,
    filename: pdf.originalName,
    uploadDate: pdf.uploadDate
  }));
  res.json(pdfList);
});

// Delete PDF
app.delete('/api/pdfs/:id', (req, res) => {
  const pdfId = req.params.id;
  const pdfIndex = pdfDatabase.findIndex(pdf => pdf.id === pdfId);

  if (pdfIndex === -1) {
    return res.status(404).json({ error: 'PDF not found' });
  }

  const pdf = pdfDatabase[pdfIndex];
  
  if (fs.existsSync(pdf.path)) {
    fs.unlinkSync(pdf.path);
  }

  pdfDatabase.splice(pdfIndex, 1);
  res.json({ success: true, message: 'PDF deleted successfully' });
});

// Answer question using Groq AI
app.post('/api/ask', async (req, res) => {
  try {
    const { question, language } = req.body;
    console.log(`Received question: ${question} (Language: ${language})`);
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Check if API key is set
    if (GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      // Fallback responses if no API key
      const fallbackResponses = {
        'en-IN': 'Lord Swaminarayan was born in Chhapaiya in 1781. He established the Swaminarayan Sampradaya and taught devotion, dharma, and moral living.',
        'hi-IN': 'भगवान स्वामिनारायण का जन्म 1781 में छपैया में हुआ था। उन्होंने स्वामिनारायण संप्रदाय की स्थापना की और भक्ति, धर्म और नैतिक जीवन की शिक्षा दी।',
        'gu-IN': 'ભગવાન સ્વામિનારાયણનો જન્મ 1781માં છપૈયામાં થયો હતો. તેમણે સ્વામિનારાયણ સંપ્રદાયની સ્થાપના કરી અને ભક્તિ, ધર્મ અને નૈતિક જીવનનો ઉપદેશ આપ્યો.'
      };
      
      return res.json({ 
        answer: fallbackResponses[language] || fallbackResponses['en-IN'] + ' (Demo mode - Set Groq API key for AI responses)'
      });
    }

    // Combine all PDF texts
    const context = pdfDatabase.map(pdf => pdf.text).join('\n\n').substring(0, 3000);
    console.log(`Using context of ${context.length} characters from ${pdfDatabase.length} PDFs`);
    // Language mapping
    const languageNames = {
      'en-IN': 'English',
      'hi-IN': 'Hindi',
      'gu-IN': 'Gujarati'
    };

    const responseLanguage = languageNames[language] || 'English';

    // Create prompt
    const prompt = `Context about Lord Swaminarayan:
${context || 'Lord Swaminarayan (1781-1830) founded the Swaminarayan Sampradaya. Born in Chhapaiya, he taught devotion, dharma, and moral living.'}

Question: ${question}

Please answer in ${responseLanguage} language only. Keep the answer concise (2-3 sentences). Be respectful and accurate.`;

    // Call Groq API
    const answer = await callGroqAPI(prompt);

    res.json({ answer: answer.trim() });
  } catch (error) {
    console.error('Error processing question:', error);
    
    // Fallback responses
    const fallbackMessages = {
      'en-IN': 'Lord Swaminarayan established many temples and taught the path of devotion. His teachings are preserved in the Vachanamrut.',
      'hi-IN': 'भगवान स्वामिनारायण ने कई मंदिरों की स्थापना की और भक्ति का मार्ग सिखाया। उनकी शिक्षाएं वचनामृत में संरक्षित हैं।',
      'gu-IN': 'ભગવાન સ્વામિનારાયણે ઘણા મંદિરો સ્થાપ્યા અને ભક્તિનો માર્ગ શીખવ્યો. તેમની શિક્ષાઓ વચનામૃતમાં સાચવેલી છે.'
    };

    res.json({
      answer: fallbackMessages[req.body.language] || fallbackMessages['en-IN']
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  const apiStatus = GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE' ? 'Groq AI Active' : 'Demo Mode (No API Key)';
  res.json({ 
    status: 'ok', 
    pdfsLoaded: pdfDatabase.length,
    engine: apiStatus
  });
});

// Load existing PDFs on startup
loadExistingPDFs().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 Web upload interface: http://localhost:${PORT}/upload`);
    console.log(`📱 Use your local IP address in the React Native app`);
    
    if (GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      console.log(`⚠️  No Groq API key set - using fallback responses`);
      console.log(`🔑 Get free API key at: https://console.groq.com/keys`);
    } else {
      console.log(`🤖 Using Groq AI with Llama 3 model`);
    }
    
    console.log(`📚 ${pdfDatabase.length} PDFs loaded`);
  });
});