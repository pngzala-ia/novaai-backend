const express = require("express");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();

// ===============================
// CONFIGURAÇÕES
// ===============================

app.use(express.json());

// CORS liberado para o aplicativo
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// ===============================
// OPENAI
// ===============================

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não configurada.");
}

const client = apiKey
    ? new OpenAI({
        apiKey: apiKey
    })
    : null;

// ===============================
// TESTE DO SERVIDOR
// ===============================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "NovaAI Backend",
        openai: apiKey ? "configurada" : "não configurada",
        message: "Backend funcionando corretamente."
    });
});

// ===============================
// CHAT DA NOVAAI
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
                error: "OPENAI_API_KEY não configurada no Render."
            });
        }

        console.log("Mensagem recebida:", message);

        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: [
                {
                    role: "system",
                    content:
                        "Você é a NovaAI, assistente oficial integrada à rede social GeraçãoZ. Responda em português do Brasil de forma útil, amigável e clara."
                },
                {
                    role: "user",
                    content: message
                }
            ]
        });

        const reply = response.output_text || "Não consegui gerar uma resposta.";

        console.log("Resposta gerada com sucesso.");

        return res.json({
            success: true,
            reply: reply
        });

    } catch (error) {
        console.error("ERRO NA NOVAAI:");
        console.error(error);

        return res.status(500).json({
            success: false,
            error: "Erro ao gerar resposta da NovaAI.",
            details: error?.message || "Erro desconhecido."
        });
    }
});

// ===============================
// SERVIDOR
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`NovaAI Backend rodando na porta ${PORT}`);
});
