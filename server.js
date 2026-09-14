const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não foi configurada.");
}

const client = new OpenAI({
    apiKey: apiKey
});

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "NovaAI Backend está funcionando!",
        openai_key: apiKey ? "configurado" : "não configurado"
    });
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Mensagem vazia."
            });
        }

        if (!apiKey) {
            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no servidor."
            });
        }

        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: message
        });

        res.json({
            reply: response.output_text
        });

    } catch (error) {
        console.error("Erro NovaAI:", error);

        res.status(500).json({
            error: "Não foi possível obter uma resposta da IA.",
            details: error?.message || "Erro desconhecido"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`NovaAI rodando na porta ${PORT}`);
});
