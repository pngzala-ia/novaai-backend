const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

// CORS
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// OpenAI
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// TESTE DO SERVIDOR
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "NovaAI Backend está funcionando!"
    });
});

// TESTE DA API
app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        openai_key: process.env.OPENAI_API_KEY ? "configurada" : "NAO_CONFIGURADA"
    });
});

// CHAT
app.post("/api/chat", async (req, res) => {

    try {

        console.log("=================================");
        console.log("NovaAI recebeu uma mensagem");

        const { message } = req.body;

        console.log("Mensagem:", message);

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Mensagem vazia."
            });
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error("OPENAI_API_KEY NÃO CONFIGURADA");

            return res.status(500).json({
                error: "OPENAI_API_KEY não está configurada no Render."
            });
        }

        console.log("Enviando mensagem para OpenAI...");

        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: message
        });

        console.log("Resposta recebida da OpenAI");

        res.json({
            reply: response.output_text
        });

    } catch (error) {

        console.error("=================================");
        console.error("ERRO DA NOVAAI:");
        console.error(error);
        console.error("=================================");

        res.status(500).json({
            error: error.message || "Erro desconhecido ao consultar a IA."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`NovaAI rodando na porta ${PORT}`);
});
