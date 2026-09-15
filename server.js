const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 10000;

// =====================================================
// CORS
// Aceita o TrebEdit/file:// e também páginas normais
// =====================================================

app.use(
  cors({
    origin: function (origin, callback) {
      // TrebEdit / file:// normalmente chega como origin "null"
      if (!origin || origin === "null") {
        return callback(null, true);
      }

      // Permite qualquer origem para este projeto
      return callback(null, true);
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],

    optionsSuccessStatus: 204
  })
);

// Garante que requisições OPTIONS sejam respondidas
app.options("*", cors());

app.use(express.json({ limit: "1mb" }));

// =====================================================
// OPENAI
// =====================================================

const apiKey = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey
});

// =====================================================
// ROTA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "NovaAI Backend funcionando!",
    openai_configurada: !!apiKey
  });
});

// =====================================================
// TESTE DA API
// =====================================================

app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "API da NovaAI funcionando!"
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

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no Render."
      });
    }

    console.log("Mensagem recebida:", message);

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const reply = response.output_text || "Não consegui gerar uma resposta.";

    console.log("Resposta gerada com sucesso.");

    res.json({
      reply: reply
    });

  } catch (error) {
    console.error("ERRO OPENAI:", error);

    // Sem créditos
    if (
      error.status === 429 ||
      error.code === "insufficient_quota"
    ) {
      return res.status(429).json({
        error: "A conta da OpenAI está sem créditos disponíveis.",
        details: "Adicione créditos na conta da OpenAI para continuar usando a NovaAI."
      });
    }

    res.status(500).json({
      error: "Erro ao conversar com a NovaAI.",
      details: error.message || "Erro desconhecido."
    });
  }
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("NovaAI Backend funcionando!");
  console.log("Porta:", PORT);
  console.log("OpenAI configurada:", !!apiKey);
  console.log("=================================");
});
