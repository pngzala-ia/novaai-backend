const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

// ===============================
// CORS
// ===============================
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.options("*", cors());

app.use(express.json());

// ===============================
// OPENAI
// ===============================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===============================
// TESTE DO BACKEND
// ===============================
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "NovaAI Backend",
    openai: process.env.OPENAI_API_KEY ? "configurada" : "não configurada",
    message: "Backend funcionando corretamente."
  });
});

// ===============================
// CHAT DA NOVAAI
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Mensagem vazia."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no Render."
      });
    }

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    res.json({
      reply: response.output_text || "Não consegui gerar uma resposta."
    });

  } catch (error) {
    console.error("ERRO NOVAAI:", error);

    res.status(500).json({
      error: "Erro ao conversar com a NovaAI.",
      details: error.message
    });
  }
});

// ===============================
// PORTA
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NovaAI Backend funcionando na porta ${PORT}`);
});
