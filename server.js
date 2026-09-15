const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CORS - CONFIGURAÇÃO PARA TREBEDIT / FILE://
// =====================================================

app.use((req, res, next) => {
  // Permite qualquer origem, inclusive origin: null
  res.header("Access-Control-Allow-Origin", "*");

  // Métodos permitidos
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  // Cabeçalhos permitidos
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Permite requisições de qualquer origem
  res.header("Access-Control-Allow-Credentials", "false");

  // Responde imediatamente ao preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Também mantém o middleware CORS
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// =====================================================
// OPENAI
// =====================================================

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =====================================================
// TESTE DO BACKEND
// =====================================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    novaAI: "online",
    openai_configurada: !!process.env.OPENAI_API_KEY
  });
});

// =====================================================
// NOVAAI - CHAT
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

    console.log("=================================");
    console.log("Mensagem recebida:");
    console.log(message);
    console.log("=================================");

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const reply =
      response.output_text ||
      "A NovaAI não conseguiu gerar uma resposta.";

    console.log("NovaAI respondeu com sucesso.");

    res.status(200).json({
      reply: reply
    });

  } catch (error) {

    console.error("=================================");
    console.error("ERRO NOVAAI:");
    console.error(error);
    console.error("=================================");

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

  console.log("=================================");
  console.log("NovaAI Backend funcionando!");
  console.log("Porta:", PORT);
  console.log(
    "OpenAI configurada:",
    !!process.env.OPENAI_API_KEY
  );
  console.log("CORS manual ativado.");
  console.log("=================================");

});
