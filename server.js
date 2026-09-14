const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "NovaAI Backend está funcionando!"
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

        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: message
        });

        res.json({
            reply: response.output_text
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Não foi possível obter uma resposta da IA."
        });

    }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`NovaAI rodando na porta ${PORT}`);
});
