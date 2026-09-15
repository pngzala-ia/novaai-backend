const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;

/* =========================
   CORS
========================= */

app.use(
    cors({
        origin: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

app.use(express.json());

/* =========================
   OPENAI
========================= */

let client = null;

if (API_KEY) {
    client = new OpenAI({
        apiKey: API_KEY
    });

    console.log("OPENAI_API_KEY configurada.");
} else {
    console.warn("AVISO: OPENAI_API_KEY não configurada.");
}

/* =========================
   TESTE DO SERVIDOR
========================= */

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "NovaAI Backend",
        openai: client ? "configurada" : "não configurada",
        message: "Backend funcionando corretamente."
    });
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        backend: "NovaAI",
        openai: client ? "connected" : "not_configured"
    });
});

/* =========================
   CHAT NOVAAI
========================= */

app.post("/api/chat", async (req, res) => {

    try {

        const message = req.body?.message;

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                error: "Mensagem inválida."
            });
        }

        if (!message.trim()) {
            return res.status(400).json({
                error: "Mensagem vazia."
            });
        }

        if (!client) {
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

        console.log("Resposta gerada com sucesso.");

        return res.json({
            success: true,
            reply: reply
        });

    } catch (error) {

        console.error("ERRO NOVAAI:", error);

        return res.status(500).json({
            success: false,
            error: "Erro ao conversar com a NovaAI.",
            details: error?.message || "Erro desconhecido."
        });
    }
});

/* =========================
   ERRO GLOBAL
========================= */

app.use((err, req, res, next) => {

    console.error("ERRO DO SERVIDOR:", err);

    res.status(500).json({
        error: "Erro interno do servidor."
    });
});

/* =========================
   INICIAR SERVIDOR
========================= */

app.listen(PORT, "0.0.0.0", () => {

    console.log("--------------------------------");
    console.log("NovaAI Backend iniciado");
    console.log("Porta:", PORT);
    console.log("OpenAI:", client ? "CONFIGURADA" : "NÃO CONFIGURADA");
    console.log("--------------------------------");

});
