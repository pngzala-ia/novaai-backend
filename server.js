const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

/* =========================
   CORS
   ========================= */

const corsOptions = {
    origin: function (origin, callback) {

        // Permite file:// e clientes sem Origin
        if (!origin || origin === "null") {
            return callback(null, true);
        }

        // Permite os testes do aplicativo
        return callback(null, true);
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: false,

    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

/* =========================
   JSON
   ========================= */

app.use(express.json());

/* =========================
   OPENAI
   ========================= */

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não foi configurada.");
} else {
    console.log("OPENAI API KEY: CONFIGURADA");
}

const client = apiKey
    ? new OpenAI({
        apiKey: apiKey
    })
    : null;

/* =========================
   ROTA PRINCIPAL
   ========================= */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        message: "NovaAI Backend está funcionando!",
        openai_key: apiKey
            ? "configurado"
            : "não configurado"
    });

});

/* =========================
   HEALTH CHECK
   ========================= */

app.get("/health", (req, res) => {

    res.json({
        status: "ok",
        service: "NovaAI",
        openai: !!apiKey
    });

});

/* =========================
   NOVAAI CHAT
   ========================= */

app.post("/api/chat", async (req, res) => {

    try {

        const { message } = req.body || {};

        /* Mensagem vazia */

        if (
            !message ||
            typeof message !== "string" ||
            !message.trim()
        ) {

            return res.status(400).json({
                error: "Mensagem vazia."
            });

        }

        /* Verifica chave */

        if (!apiKey || !client) {

            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no servidor."
            });

        }

        console.log(
            "NovaAI recebeu:",
            message.trim()
        );

        /* Chamada para OpenAI */

        const response = await client.responses.create({

            model: "gpt-5-mini",

            input: message.trim()

        });

        const reply =
            response.output_text ||
            "Não recebi uma resposta da IA.";

        console.log(
            "NovaAI respondeu corretamente."
        );

        return res.json({

            reply: reply

        });

    } catch (error) {

        console.error(
            "ERRO NOVAAI:",
            error
        );

        const status =
            error?.status || 500;

        return res.status(status).json({

            error:
                error?.message ||
                "Não foi possível obter uma resposta da IA.",

            code:
                error?.code || null,

            type:
                error?.type || null

        });

    }

});

/* =========================
   PORTA
   ========================= */

const PORT =
    process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `NovaAI Backend funcionando na porta ${PORT}`
    );

});
