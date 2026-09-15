const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

/* =========================================
   CORS
   Permite o HTML do TrebEdit (origin null)
========================================= */

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* Responde às requisições de preflight */
app.options("*", cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* =========================================
   JSON
========================================= */

app.use(express.json());

/* =========================================
   OPENAI
========================================= */

const apiKey = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey
});

/* =========================================
   TESTE DO SERVIDOR
========================================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    novaAI: "online",
    openai_configurada: !!apiKey,
    cors: "ativo"
  });
});

/* =========================================
   CHAT DA NOVAAI
========================================= */

app.post("/api/chat", async (req, res) => {

  try {

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Mensagem não informada."
      });
    }

    if (!apiKey) {
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

    console.log("NovaAI respondeu.");

    res.json({
      success: true,
      reply: resposta
    });

  } catch (error) {

    console.error("ERRO NOVAAI:", error);

    res.status(500).json({
      success: false,
      error: "Erro ao conversar com a NovaAI.",
      details: error.message
    });

  }

});

/* =========================================
   PORTA
========================================= */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

  console.log("================================");
  console.log("NovaAI Backend funcionando!");
  console.log("Porta:", PORT);
  console.log("OpenAI configurada:", !!apiKey);
  console.log("CORS ativado!");
  console.log("================================");

});
