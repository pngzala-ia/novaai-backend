const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

// ===============================
// CONFIGURAÇÕES
// ===============================

const PORT = process.env.PORT || 10000;

// ===============================
// CORS
// ===============================

// Permite o TrebEdit / file://
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);

// Responde explicitamente ao preflight
app.options("*", cors());

// ===============================
// JSON
// ===============================

app.use(express.json({ limit: "1mb" }));

// ===============================
// OPENAI
// ===============================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===============================
// ROTA PRINCIPAL
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    novaAI: "online",
    openai_configurada: !!process.env.OPENAI_API_KEY
  });
});

// ===============================
// ROTA DE TESTE
// ===============================

app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    novaAI: "online",
    openai_configurada: !!process.env.OPENAI_API_KEY
  });
});

// ===============================
// CHAT NOVAAI
// ===============================

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
        error: "OPENAI_API_KEY não configurada no servidor."
      });
    }

    console.log("NovaAI recebeu:", message);

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const resposta = response.output_text || "Não consegui gerar uma resposta.";

    console.log("NovaAI respondeu com sucesso.");

    res.json({
      success: true,
      response: resposta
    });

  } catch (error) {
    console.error("Erro na NovaAI:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Erro interno do servidor."
    });
  }
});

// ===============================
// TRATAMENTO DE ERROS
// ===============================

app.use((err, req, res, next) => {
  console.error("Erro geral:", err);

  res.status(500).json({
    error: "Erro interno do servidor."
  });
});

// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("NovaAI Backend funcionando!");
  console.log("Porta:", PORT);
  console.log(
    "OpenAI configurada:",
    !!process.env.OPENAI_API_KEY
  );
  console.log("CORS ativado.");
  console.log("================================");
});
