const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

// ===============================
// CONFIGURAÇÕES
// ===============================

app.use(cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// ===============================
// PORTA
// ===============================

const PORT = process.env.PORT || 3000;

// ===============================
// OPENAI
// ===============================

const apiKey = process.env.OPENAI_API_KEY;

let client = null;

if (apiKey) {
    client = new OpenAI({
        apiKey: apiKey
    });

    console.log("OPENAI_API_KEY configurada.");
} else {
    console.warn("AVISO: OPENAI_API_KEY não configurada.");
}

// ===============================
// ROTA PRINCIPAL
// ===============================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "NovaAI Backend está funcionando!",
        openai: client ? "conectada" : "não configurada"
    });
});

// ===============================
// TESTE
// ===============================

app.get("/api/status", (req, res) => {
    res.json({
        online: true,
        openai: client ? true : false,
        message: client
            ? "NovaAI pronta para receber mensagens."
            : "Servidor online, mas OPENAI_API_KEY não configurada."
    });
});

// ===============================
// CHAT
// ===============================

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
                error: "OPENAI_API_KEY não configurada no servidor."
            });

        }

        console.log("Mensagem recebida:", message);

        const response = await client.responses.create({

            model: "gpt-5-mini",

            input: message

        });

        const reply = response.output_text;

        console.log("Resposta gerada com sucesso.");

        res.json({
            reply: reply
        });

    } catch (error) {

        console.error("ERRO NA OPENAI:", error);

        res.status(500).json({

            error: "Não foi possível obter uma resposta da IA.",

            details: error?.message || "Erro desconhecido"

        });

    }

});

// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {

    console.log("--------------------------------");
    console.log("NovaAI Backend iniciado!");
    console.log("Porta:", PORT);
    console.log("OpenAI:", client ? "CONFIGURADA" : "NÃO CONFIGURADA");
    console.log("--------------------------------");

});
