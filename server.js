const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

/* =========================================
   CORS
========================================= */

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
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

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization"
    ]
}));

app.use(express.json({
    limit: "10mb"
}));

/* =========================================
   OPENAI
========================================= */

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/* =========================================
   TESTE DO SERVIDOR
========================================= */

app.get("/", (req, res) => {

    res.status(200).json({
        status: "online",
        service: "NovaAI",
        app: "GeraçãoZ",
        cors: true,
        openai_configurada: !!process.env.OPENAI_API_KEY,
        version: "novaai-cors-2026"
    });

});

/* =========================================
   CHAT
========================================= */

app.post("/api/chat", async (req, res) => {

    try {

        const message = req.body.message;

        if (!message || !message.trim()) {

            return res.status(400).json({
                success: false,
                error: "Mensagem vazia."
            });

        }

        console.log("Mensagem recebida:", message);

        const response = await openai.responses.create({

            model: "gpt-5-mini",

            input: message

        });

        const reply =
            response.output_text ||
            "Não consegui gerar uma resposta.";

        console.log("Resposta gerada com sucesso.");

        return res.status(200).json({

            success: true,

            reply: reply

        });

    } catch (error) {

        console.error("ERRO NA NOVAAI:");

        console.error(error);

        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Erro interno no servidor."

        });

    }

});

/* =========================================
   ROTA NÃO ENCONTRADA
========================================= */

app.use((req, res) => {

    res.status(404).json({

        success: false,

        error: "Rota não encontrada."

    });

});

/* =========================================
   SERVIDOR
========================================= */

const PORT =
    process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log("--------------------------------");
    console.log("NovaAI iniciada");
    console.log("Porta:", PORT);
    console.log(
        "OPENAI_API_KEY configurada:",
        !!process.env.OPENAI_API_KEY
    );
    console.log("CORS: ATIVADO");
    console.log("Versão: novaai-cors-2026");
    console.log("--------------------------------");

});
