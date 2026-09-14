const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não configurada.");
}

const client = apiKey
    ? new OpenAI({
        apiKey: apiKey
    })
    : null;

// Teste do servidor
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "NovaAI Backend está funcionando!",
        openai_key: apiKey ? "configurado" : "não configurado"
    });
});

// Chat com a NovaAI
app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Mensagem vazia."
            });
        }

        if (!client) {
            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no Render."
            });
        }

        const response = await client.responses.create({
            model: "gpt-5.6-luna",
            input: message.trim()
        });

        res.json({
            success: true,
            reply: response.output_text
        });

    } catch (error) {
        console.error("ERRO OPENAI:", error);

        res.status(500).json({
            success: false,
            error: "Não foi possível obter uma resposta da IA.",
            details: error.message
        });
    }
});

// Porta do Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`NovaAI Backend rodando na porta ${PORT}`);
});
