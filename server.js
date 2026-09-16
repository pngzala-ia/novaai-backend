const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

app.use(cors());

app.use(express.json({
    limit: "10mb"
}));

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
    res.json({
        status: "online",
        novaai: "NovaAI da GeraçãoZ",
        openai_configurada: !!process.env.OPENAI_API_KEY
    });
});

app.post("/api/chat", async (req, res) => {

    try {

        const message = req.body.message;

        if (!message) {
            return res.status(400).json({
                error: "Mensagem vazia."
            });
        }

        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: message
        });

        res.json({
            success: true,
            reply: response.output_text
        });

    } catch (error) {

        console.error("ERRO NOVAAI:", error);

        res.status(500).json({
            success: false,
            error: error.message || "Erro interno no servidor."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`NovaAI online na porta ${PORT}`);
    console.log(
        "OPENAI_API_KEY configurada:",
        !!process.env.OPENAI_API_KEY
    );
});
