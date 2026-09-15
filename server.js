const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CORS
// Permite o TrebEdit (origem "null") e outros acessos
// =====================================================

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem Origin, incluindo alguns ambientes locais
    if (!origin) {
      return callback(null, true);
    }

    // Permite o TrebEdit / file://
    if (origin === "null") {
      return callback(null, true);
    }

    // Permite qualquer origem
    return callback(null, true);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
}));

// Responde ao preflight OPTIONS
app.options("*", cors());

app.use(express.json());

// =====================================================
// OPENAI
// =====================================================

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =====================================================
// TESTE DO SERVIDOR
// =====================================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    novaAI: "online",
    openai_configurada: !!process.env.OPENAI_API_KEY
  });
});

// =====================================================
// CHAT DA NOVAAI
// =====================================================

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Mensagem inválida."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no Render."
      });
    }

    console.log("Mensagem recebida:", message);

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const reply = response.output_text || "Não consegui gerar uma resposta.";

    console.log("Resposta enviada com sucesso.");

    res.json({
      reply: reply
    });

  } catch (error) {
    console.error("ERRO NOVAAI:", error);

    res.status(500).json({
      error: "Erro ao conversar com a NovaAI.",
      details: error.message || "Erro desconhecido."
    });
  }
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {
  console.log(`NovaAI backend rodando na porta ${PORT}`);
  console.log(
    "OPENAI_API_KEY configurada:",
    !!process.env.OPENAI_API_KEY
  );
});
