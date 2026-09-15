const express = require("express");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();

// ========================================
// CORS - CONFIGURAÇÃO
// ========================================

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
    );

    // Responde imediatamente ao preflight
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    next();
});

app.use(express.json());

// ========================================
// OPENAI
// ========================================

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não configurada.");
}

const openai = apiKey
    ? new OpenAI({
        apiKey: apiKey
    })
    : null;

// ========================================
// TESTE
// ========================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "NovaAI Backend",
        openai: apiKey ? "configurada" : "não configurada",
        message: "Backend funcionando corretamente."
    });
});

// ========================================
// NOVAAI
// ========================================

app.post("/api/chat", async (req, res) => {

    // Garante CORS também na resposta do POST
    res.setHeader("Access-Control-Allow-Origin", "*");

    try {

        const message = req.body?.message;

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                error: "Mensagem inválida."
            });
        }

        if (!openai) {
            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no Render."
            });
        }

        console.log("Mensagem recebida:", message);

        const response = await openai.responses.create({
            model: "gpt-5-mini",
            input: [
                {
                    role: "system",
                    content:
                        "Você é a NovaAI, a inteligência artificial integrada à rede social GeraçãoZ. Responda em português do Brasil de forma amigável, clara e útil."
                },
                {
                    role: "user",
                    content: message
                }
            ]
        });

        const reply =
            response.output_text ||
            "Desculpe, não consegui gerar uma resposta.";

        console.log("NovaAI respondeu com sucesso.");

        return res.json({
            success: true,
            reply: reply
        });

    } catch (error) {

        console.error("ERRO NOVAAI:", error);

        return res.status(500).json({
            success: false,
            error: "Erro ao gerar resposta da NovaAI.",
            details: error?.message || "Erro desconhecido."
        });
    }
});

// ========================================
// SERVIDOR
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log("NovaAI Backend iniciado");
    console.log("Porta:", PORT);
    console.log("================================");
});
