const express = require("express");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 10000;

// ======================================================
// CORS MANUAL
// ======================================================

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Aceita:
  // - TrebEdit / file:// -> origin "null"
  // - localhost
  // - qualquer página HTTPS
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Responde imediatamente ao preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ======================================================
// JSON
// ======================================================

app.use(express.json({ limit: "1mb" }));

// ======================================================
// OPENAI
// ======================================================

const apiKey = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey
});

// ======================================================
// ROTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "NovaAI Backend funcionando!",
    openai_configurada: !!apiKey
  });
});

// ======================================================
// TESTE
// ======================================================

app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "API da NovaAI funcionando!"
  });
});

// ======================================================
// NOVAAI
// ======================================================

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    console.log("=================================");
    console.log("NovaAI recebeu uma mensagem:");
    console.log(message);
    console.log("=================================");

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Mensagem inválida."
      });
    }

    if (!apiKey) {
      console.error("OPENAI_API_KEY não configurada.");

      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no Render."
      });
    }

    // ==================================================
    // CHAMADA PARA OPENAI
    // ==================================================

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const reply =
      response.output_text ||
      "A NovaAI não conseguiu gerar uma resposta.";

    console.log("NovaAI respondeu com sucesso.");

    return res.json({
      reply: reply
    });

  } catch (error) {

    console.error("=================================");
    console.error("ERRO NA NOVAAI");
    console.error(error);
    console.error("=================================");

    // ==================================================
    // SEM CRÉDITOS
    // ==================================================

    if (
      error.status === 429 ||
      error.code === "insufficient_quota"
    ) {
      return res.status(429).json({
        error: "A conta da OpenAI está sem créditos disponíveis.",
        details:
          "Adicione créditos na conta da OpenAI para continuar usando a NovaAI."
      });
    }

    // ==================================================
    // OUTRO ERRO
    // ==================================================

    return res.status(500).json({
      error: "Erro ao conversar com a NovaAI.",
      details: error.message || "Erro desconhecido."
    });
  }
});

// ======================================================
// SERVIDOR
// ======================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("NovaAI Backend funcionando!");
  console.log("Porta:", PORT);
  console.log("OpenAI configurada:", !!apiKey);
  console.log("CORS manual ativado.");
  console.log("=================================");
});
