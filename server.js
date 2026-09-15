const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
// CONFIGURAÇÕES
// ================================

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

app.use(express.json({ limit: "1mb" }));

// ================================
// OPENAI
// ================================

const apiKey = process.env.OPENAI_API_KEY;

const client = apiKey
  ? new OpenAI({
      apiKey: apiKey
    })
  : null;

// ================================
// ROTA PRINCIPAL
// ================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "NovaAI Backend",
    openai: apiKey ? "configurada" : "não configurada",
    message: "Backend funcionando corretamente."
  });
});

// ================================
// ROTA DE TESTE
// ================================

app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    openai: apiKey ? true : false
  });
});

// ================================
// NOVAAI
// ================================

app.post("/api/chat", async (req, res) => {

  try {

    // Verifica API Key
    if (!apiKey || !client) {
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada.",
        details: "Adicione OPENAI_API_KEY nas Environment Variables do Render."
      });
    }

    // Verifica mensagem
    const message = req.body?.message;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Mensagem inválida.",
        details: "Envie uma mensagem no campo 'message'."
      });
    }

    // Limite simples para evitar mensagens gigantes
    const userMessage = message.trim().slice(0, 4000);

    if (!userMessage) {
      return res.status(400).json({
        error: "Mensagem vazia."
      });
    }

    console.log("NovaAI recebeu:", userMessage);

    // ================================
    // CHAMADA PARA OPENAI
    // ================================

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content:
            "Você é a NovaAI, assistente de inteligência artificial integrada à rede social GeraçãoZ. Responda em português do Brasil de forma clara, amigável e útil."
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_output_tokens: 1000
    });

    const reply = response.output_text || "";

    if (!reply) {
      return res.status(500).json({
        error: "A OpenAI não retornou texto.",
        details: "A resposta da API veio sem conteúdo."
      });
    }

    console.log("NovaAI respondeu com sucesso.");

    return res.status(200).json({
      success: true,
      reply: reply
    });

  } catch (error) {

    console.error("ERRO NOVAAI:");
    console.error(error);

    // ================================
    // SEM CRÉDITOS
    // ================================

    if (
      error?.status === 429 ||
      error?.code === "insufficient_quota" ||
      error?.message?.toLowerCase().includes("credit")
    ) {
      return res.status(429).json({
        error: "A API da NovaAI está sem créditos.",
        details:
          "A conta da API OpenAI não possui créditos disponíveis no momento. Adicione créditos/billing na conta da OpenAI para continuar."
      });
    }

    // ================================
    // API KEY INVÁLIDA
    // ================================

    if (
      error?.status === 401 ||
      error?.code === "invalid_api_key"
    ) {
      return res.status(401).json({
        error: "OPENAI_API_KEY inválida.",
        details:
          "Verifique a chave OPENAI_API_KEY cadastrada nas Environment Variables do Render."
      });
    }

    // ================================
    // LIMITE DE REQUISIÇÕES
    // ================================

    if (error?.status === 429) {
      return res.status(429).json({
        error: "Limite de requisições atingido.",
        details:
          "A API recebeu muitas requisições. Aguarde um pouco e tente novamente."
      });
    }

    // ================================
    // ERRO GENÉRICO
    // ================================

    return res.status(500).json({
      error: "Erro ao conversar com a NovaAI.",
      details: error?.message || "Erro desconhecido."
    });
  }
});

// ================================
// ERRO DE JSON
// ================================

app.use((error, req, res, next) => {

  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      error: "JSON inválido."
    });
  }

  next(error);
});

// ================================
// INICIAR SERVIDOR
// ================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NovaAI Backend funcionando na porta ${PORT}`);
  console.log(
    `OPENAI_API_KEY: ${apiKey ? "CONFIGURADA" : "NÃO CONFIGURADA"}`
  );
});
