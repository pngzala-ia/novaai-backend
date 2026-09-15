const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 10000;

/* =========================================================
   OPENAI
========================================================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   CORS
   Permite o GeraçãoZ aberto pelo TrebEdit
   inclusive quando o navegador envia Origin: null
========================================================= */

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

/* Preflight */
app.options("*", cors(corsOptions));

/* =========================================================
   BODY
========================================================= */

app.use(express.json());

/* =========================================================
   TESTE DO SERVIDOR
========================================================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    novaAI: "online",
    openai_configurada: !!process.env.OPENAI_API_KEY
  });
});

/* =========================================================
   CHAT
========================================================= */

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

    const response = await openai.responses.create({

      model: "gpt-5-mini",

      input: message

    });

    const text =
      response.output_text ||
      "Não consegui gerar uma resposta.";

    console.log("Resposta gerada com sucesso.");

    res.json({
      success: true,
      response: text
    });

  } catch (error) {

    console.error("ERRO OPENAI:", error);

    res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Erro interno no servidor."

    });

  }

});

/* =========================================================
   ERRO 404
========================================================= */

app.use((req, res) => {

  res.status(404).json({
    error: "Rota não encontrada."
  });

});

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

app.listen(PORT, () => {

  console.log("=================================");
  console.log("NovaAI Backend funcionando!");
  console.log("Porta:", PORT);
  console.log(
    "OpenAI configurada:",
    !!process.env.OPENAI_API_KEY
  );
  console.log("CORS ativado.");
  console.log("=================================");

});
