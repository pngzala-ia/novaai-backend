const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
   CORS
   Permite o HTML aberto localmente pelo Acode/TrebEdit
   e também páginas hospedadas.
===================================================== */

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

/*
   Trata explicitamente o preflight OPTIONS.
*/
app.options("*", cors(corsOptions));

/* =====================================================
   JSON
===================================================== */

app.use(express.json({ limit: "1mb" }));

/* =====================================================
   ROTA PRINCIPAL
===================================================== */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "NovaAI Backend está funcionando.",
    apiKeyConfigured: !!process.env.OPENAI_API_KEY
  });
});

/* =====================================================
   TESTE DE SAÚDE
===================================================== */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NovaAI",
    openai: !!process.env.OPENAI_API_KEY
  });
});

/* =====================================================
   NOVAAI
===================================================== */

app.post("/api/chat", async (req, res) => {

  try {

    const { message } = req.body;

    /* ---------------------------------------------
       Verifica a mensagem
    --------------------------------------------- */

    if (!message || typeof message !== "string") {

      return res.status(400).json({
        error: "A mensagem é obrigatória."
      });

    }

    const cleanMessage = message.trim();

    if (!cleanMessage) {

      return res.status(400).json({
        error: "A mensagem não pode estar vazia."
      });

    }

    /* ---------------------------------------------
       Limite simples para evitar mensagens gigantes
    --------------------------------------------- */

    if (cleanMessage.length > 4000) {

      return res.status(400).json({
        error: "A mensagem é muito longa."
      });

    }

    /* ---------------------------------------------
       Verifica API KEY
    --------------------------------------------- */

    if (!process.env.OPENAI_API_KEY) {

      console.error("OPENAI_API_KEY não configurada.");

      return res.status(500).json({
        error: "A chave da OpenAI não está configurada no Render."
      });

    }

    console.log("NovaAI recebeu:", cleanMessage);

    /* ---------------------------------------------
       Chamada para OpenAI
    --------------------------------------------- */

    const response = await openai.responses.create({

      model: "gpt-5-mini",

      input: [
        {
          role: "system",
          content:
            "Você é a NovaAI, assistente de inteligência artificial integrada ao aplicativo GeraçãoZ. Responda em português do Brasil de forma útil, clara e amigável."
        },
        {
          role: "user",
          content: cleanMessage
        }
      ]

    });

    /* ---------------------------------------------
       Texto da resposta
    --------------------------------------------- */

    const answer =
      response.output_text ||
      "Não consegui gerar uma resposta no momento.";

    console.log("NovaAI respondeu com sucesso.");

    return res.json({
      reply: answer
    });

  } catch (error) {

    console.error("ERRO NOVAAI:");

    console.error(error);

    return res.status(500).json({
      error: "Erro interno ao conversar com a NovaAI.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });

  }

});

/* =====================================================
   ROTA PARA MÉTODO NÃO PERMITIDO
===================================================== */

app.use((req, res) => {

  res.status(404).json({
    error: "Rota não encontrada.",
    path: req.path,
    method: req.method
  });

});

/* =====================================================
   INICIAR SERVIDOR
===================================================== */

app.listen(PORT, () => {

  console.log("======================================");
  console.log("NovaAI Backend iniciado.");
  console.log("Porta:", PORT);
  console.log(
    "OPENAI_API_KEY:",
    process.env.OPENAI_API_KEY
      ? "CONFIGURADA"
      : "NÃO CONFIGURADA"
  );
  console.log("======================================");

});
